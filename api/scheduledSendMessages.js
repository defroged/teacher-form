import { timingSafeEqual } from 'node:crypto';
import { admin, adminDb } from '../lib/firebaseAdmin.js';
import { canonicalizeClassName } from '../lib/classNames.js';
import { getValidWebhookURLs } from '../lib/discordWebhooks.js';

const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 5;

function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return true;
  }

  const authorization = typeof req.headers.authorization === 'string'
    ? req.headers.authorization
    : '';
  const suppliedToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  const expected = Buffer.from(cronSecret);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function toMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  if (value && Number.isFinite(value.seconds)) {
    return value.seconds * 1000;
  }
  return Number.NaN;
}

async function getWebhooksForTask(task) {
  const className = canonicalizeClassName(task.className);
  if (className) {
    const webhookDocument = await adminDb
      .collection('DiscordWebhooks')
      .doc(className)
      .get();

    if (webhookDocument.exists) {
      const configuredWebhooks = getValidWebhookURLs(webhookDocument.data());
      if (configuredWebhooks.length > 0) {
        return configuredWebhooks;
      }
    }
  }

  // Backward compatibility for reservations created before webhook lookup moved server-side.
  return getValidWebhookURLs({ webhookURLs: task.webhooks });
}

function shouldProcessTask(task, now) {
  const scheduledTime = toMillis(task.scheduledTime);
  if (!Number.isFinite(scheduledTime) || scheduledTime > now) {
    return false;
  }

  if (task.status === 'not_sent') {
    return true;
  }

  if (task.status === 'sending') {
    const processingStartedAt = toMillis(task.processingStartedAt);
    return !Number.isFinite(processingStartedAt)
      || processingStartedAt <= now - PROCESSING_TIMEOUT_MS;
  }

  return false;
}

async function claimTask(taskReference, now) {
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(taskReference);
    if (!snapshot.exists || !shouldProcessTask(snapshot.data(), now)) {
      return null;
    }

    transaction.update(taskReference, {
      status: 'sending',
      processingStartedAt: now,
      lastError: admin.firestore.FieldValue.delete()
    });
    return snapshot.data();
  });
}

async function sendDiscordMessage(hookUrl, task) {
  const className = canonicalizeClassName(task.className) || 'Unknown class';
  const payload = {
    content:
      `今週のフラッシュカードを練習しましょう。\n`
      + `クラス: ${className}\n`
      + `${task.dynamicURL}\n`
      + 'すべての単語を英語で言えるようになったら、「100%」の画面のスクリーンショットをこちらで送ってください😊'
  };

  const response = await fetch(hookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const responseText = (await response.text()).slice(0, 500);
    throw new Error(`Discord returned ${response.status}: ${responseText}`);
  }
}

async function processTask(taskDocument, now) {
  const taskReference = taskDocument.ref;
  const task = await claimTask(taskReference, now);
  if (!task) {
    return 'skipped';
  }

  if (typeof task.dynamicURL !== 'string' || !/^https:\/\//i.test(task.dynamicURL)) {
    await taskReference.update({
      status: 'failed',
      failedAt: Date.now(),
      lastError: 'The scheduled task has no valid flashcards URL.'
    });
    return 'failed';
  }

  const webhooks = await getWebhooksForTask(task);
  if (webhooks.length === 0) {
    await taskReference.update({
      status: 'failed',
      failedAt: Date.now(),
      lastError: `No Discord webhook is configured for ${canonicalizeClassName(task.className) || 'this class'}.`
    });
    return 'failed';
  }

  const sentWebhookIndexes = new Set(
    Array.isArray(task.sentWebhookIndexes)
      ? task.sentWebhookIndexes.filter((index) => Number.isInteger(index))
      : []
  );
  const failures = [];

  for (let index = 0; index < webhooks.length; index += 1) {
    if (sentWebhookIndexes.has(index)) {
      continue;
    }

    try {
      await sendDiscordMessage(webhooks[index], task);
      sentWebhookIndexes.add(index);
      await taskReference.update({
        sentWebhookIndexes: Array.from(sentWebhookIndexes).sort((left, right) => left - right)
      });
    } catch (error) {
      console.error(`Discord delivery failed for task ${taskDocument.id}, webhook ${index}:`, error);
      failures.push(error.message);
    }
  }

  const everyWebhookWasSent = webhooks.every((_, index) => sentWebhookIndexes.has(index));
  if (failures.length === 0 && everyWebhookWasSent) {
    await taskReference.update({
      status: 'sent',
      sentAt: Date.now(),
      processingStartedAt: admin.firestore.FieldValue.delete(),
      lastError: admin.firestore.FieldValue.delete()
    });
    return 'sent';
  }

  const nextAttempt = (Number(task.deliveryAttempts) || 0) + 1;
  const exhausted = nextAttempt >= MAX_DELIVERY_ATTEMPTS;
  await taskReference.update({
    status: exhausted ? 'failed' : 'not_sent',
    deliveryAttempts: nextAttempt,
    failedAt: exhausted ? Date.now() : admin.firestore.FieldValue.delete(),
    processingStartedAt: admin.firestore.FieldValue.delete(),
    lastError: failures.join(' | ').slice(0, 1500)
  });
  return exhausted ? 'failed' : 'retrying';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = Date.now();
    const pendingSnapshot = await adminDb
      .collection('ScheduledMessages')
      .where('status', 'in', ['not_sent', 'sending'])
      .get();

    const dueDocuments = pendingSnapshot.docs.filter((documentSnapshot) => (
      shouldProcessTask(documentSnapshot.data(), now)
    ));

    const results = [];
    for (const taskDocument of dueDocuments) {
      try {
        results.push(await processTask(taskDocument, now));
      } catch (error) {
        console.error(`Unexpected scheduler error for task ${taskDocument.id}:`, error);
        await taskDocument.ref.update({
          status: 'not_sent',
          processingStartedAt: admin.firestore.FieldValue.delete(),
          lastError: error.message.slice(0, 1500)
        });
        results.push('retrying');
      }
    }

    return res.status(200).json({
      message: 'Scheduler run completed.',
      due: dueDocuments.length,
      sent: results.filter((result) => result === 'sent').length,
      retrying: results.filter((result) => result === 'retrying').length,
      failed: results.filter((result) => result === 'failed').length
    });
  } catch (error) {
    console.error('Error in scheduledSendMessages:', error);
    return res.status(500).json({ error: 'The scheduler could not complete this run.' });
  }
}
