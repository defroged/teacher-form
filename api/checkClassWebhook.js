import { adminDb } from '../lib/firebaseAdmin.js';
import { canonicalizeClassName } from '../lib/classNames.js';
import { getValidWebhookURLs } from '../lib/discordWebhooks.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const className = canonicalizeClassName(req.body?.className);
  if (!className || className.length > 100) {
    return res.status(400).json({ error: 'A valid className is required.' });
  }

  try {
    const webhookDocument = await adminDb.collection('DiscordWebhooks').doc(className).get();
    const webhookCount = webhookDocument.exists
      ? getValidWebhookURLs(webhookDocument.data()).length
      : 0;

    return res.status(200).json({
      configured: webhookCount > 0,
      webhookCount,
      className
    });
  } catch (error) {
    console.error(`Could not check Discord webhook configuration for ${className}:`, error);
    return res.status(500).json({ error: 'Could not verify the Discord webhook configuration.' });
  }
}
