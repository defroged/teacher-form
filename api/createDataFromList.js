import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import pLimit from 'p-limit';
import { storageBucket } from '../lib/firebaseAdmin.js';
import { cleanString, createSafeFileStem, createSpeechText } from '../lib/ttsText.js';

const DEFAULT_VOICE_ID = 'kdmDKE6EkgrWrrykO9Qt';
const ELEVENLABS_MODEL_ID = 'eleven_v3';

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestSpeechAudio(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured.');
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const requestBody = {
    text: createSpeechText(text),
    model_id: ELEVENLABS_MODEL_ID,
    voice_settings: {
      stability: 1
    }
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify(requestBody)
    });

    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }

    const responseText = (await response.text()).slice(0, 500);
    const canRetry = response.status === 429 || response.status >= 500;
    if (!canRetry || attempt === 3) {
      throw new Error(`ElevenLabs returned ${response.status}: ${responseText}`);
    }

    await wait(attempt * 750);
  }

  throw new Error('ElevenLabs speech generation failed.');
}

async function generateAndStoreSpeech(text, audioType) {
  const audioBuffer = await requestSpeechAudio(text);
  const fileName = [
    'flashcards_audio',
    `${createSafeFileStem(text)}-${audioType}-${Date.now()}-${randomUUID()}.mp3`
  ].join('/');

  const file = storageBucket.file(fileName);
  await file.save(audioBuffer, {
    contentType: 'audio/mpeg',
    resumable: false,
    public: false,
    metadata: {
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: '03-09-2491'
  });

  return signedUrl;
}

function normalizeGeneratedVocabulary(data, words) {
  if (!Array.isArray(data?.vocabulary) || data.vocabulary.length !== words.length) {
    throw new Error('The language model returned an unexpected number of vocabulary items.');
  }

  return words.map((word, index) => {
    const generatedItem = data.vocabulary[index] || {};
    const japanese = cleanString(generatedItem.japanese);
    const englishExample = cleanString(generatedItem.englishExample);
    const japaneseExample = cleanString(generatedItem.japaneseExample);
    if (!japanese || !englishExample || !japaneseExample) {
      throw new Error(`The language model returned incomplete data for item ${index + 1}.`);
    }

    return {
      // The teacher's editable list is authoritative. Do not let the model alter it.
      english: word,
      japanese,
      englishExample,
      japaneseExample
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const rawWords = req.body?.words;
  if (!Array.isArray(rawWords) || rawWords.length === 0) {
    return res.status(400).json({ error: 'words must be a non-empty array.' });
  }

  const words = rawWords.map(cleanString).filter(Boolean);
  if (words.length !== rawWords.length) {
    return res.status(400).json({ error: 'Every vocabulary item must contain text.' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured.' });
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured.' });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `Create Japanese translations and simple example sentences for ESL flashcards.
Return only valid JSON with this exact shape:
{"vocabulary":[{"english":"","japanese":"","englishExample":"","japaneseExample":""}]}

Return exactly one object for each supplied item and keep the same order.
- Copy each supplied item exactly into "english" without changing its spelling, capitalization, or punctuation.
- Make every "englishExample" a natural, simple, complete sentence with a capital first letter and correct ending punctuation.
- Translate accurately into natural Japanese.
- Do not include markdown or commentary.`
        },
        {
          role: 'user',
          content: JSON.stringify({ items: words })
        }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'The language model returned no flashcard data.' });
    }

    let generatedData;
    try {
      generatedData = JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse flashcard model output as JSON:', error);
      return res.status(502).json({ error: 'The language model did not return valid JSON.' });
    }

    const vocabulary = normalizeGeneratedVocabulary(generatedData, words);
    const limit = pLimit(2);
    const audioFailures = [];

    await Promise.all(vocabulary.flatMap((vocabItem, index) => [
      limit(async () => {
        try {
          vocabItem.enAudio = await generateAndStoreSpeech(vocabItem.english, 'item');
        } catch (error) {
          audioFailures.push(`item ${index + 1}: ${error.message}`);
          vocabItem.enAudio = '';
        }
      }),
      limit(async () => {
        try {
          vocabItem.enExampleAudio = await generateAndStoreSpeech(vocabItem.englishExample, 'example');
        } catch (error) {
          audioFailures.push(`example ${index + 1}: ${error.message}`);
          vocabItem.enExampleAudio = '';
        }
      })
    ]));

    if (audioFailures.length > 0) {
      console.error('One or more speech files could not be generated:', audioFailures);
      return res.status(502).json({
        error: 'One or more speech files could not be generated. Please try again.'
      });
    }

    return res.status(200).json({ processedList: vocabulary });
  } catch (error) {
    console.error('Error creating flashcard data:', error);
    return res.status(500).json({ error: 'Could not create the flashcard data.' });
  }
}
