import OpenAI from "openai";
import admin from "firebase-admin";
import pLimit from 'p-limit';

// Only initialize Admin if not already
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    ),
    storageBucket: "bs-class-database.firebasestorage.app"
  });
}

// Grab a reference to the default bucket
const bucket = admin.storage().bucket();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { words } = req.body;
  if (!words || !Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'words is required and should be a non-empty array.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured.' });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const messages = [
    {
      role: "user",
      content: `
      Please return ONLY pure JSON (no code blocks).
      The JSON structure is:
      {
        "vocabulary": [
          {
            "english": "",
            "japanese": "",
            "englishExample": "",
            "japaneseExample": ""
          }
        ]
      }

      For each of these words, create an object with:
      - "english": the word or phrase in English,
      - "japanese": the Japanese translation,
      - "englishExample": a simple English example sentence,
      - "japaneseExample": a Japanese translation of that sentence.

      The words:
      ${words.join(", ")}
      `
    }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages
    });

    const content = completion.choices[0].message.content;

    let data;
    try {
      data = JSON.parse(content);
    } catch (err) {
      console.error('Failed to parse model output as JSON:', err);
      return res.status(500).json({ error: 'Model did not return valid JSON.' });
    }

    // ElevenLabs setup
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 's0XGIcqmceN2l7kjsqoZ';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;



// Create a concurrency limiter with a limit of 10.
const limit = pLimit(2);

await Promise.all(
  data.vocabulary.map((vocabItem) =>
    limit(async () => {
      try {
        const requestBody = {
          text: vocabItem.english + ".",
          model_id: 'eleven_flash_v2_5', // change to 'eleven_v3' when api is available
          voice_settings: {
            stability: 0.9,
            similarity_boost: 0.75,
          }
        };

        const audioResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!audioResponse.ok) {
          throw new Error(`ElevenLabs TTS request failed with status: ${audioResponse.status}`);
        }

        // Read the returned audio as an ArrayBuffer
        const audioBuffer = await audioResponse.arrayBuffer();
        const buffer = Buffer.from(audioBuffer);

        // Create a unique file name
        const timestamp = Date.now();
        const fileName = `flashcards_audio/${vocabItem.english}-${timestamp}.mp3`;

        // Save to Firebase Storage
        const file = bucket.file(fileName);
        await file.save(buffer, {
          contentType: 'audio/mpeg',
          public: false
        });

        // Generate a signed URL so you can read the file
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: '03-09-2491'
        });

        // Attach this URL to the item
        vocabItem.enAudio = signedUrl;

      } catch (error) {
        console.error('Error fetching ElevenLabs TTS for word:', vocabItem.english, error);
        vocabItem.enAudio = "";
      }
    })
  )
);

    // Once all items have enAudio, return them
    return res.status(200).json({ processedList: data.vocabulary });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
