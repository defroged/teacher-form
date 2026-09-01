import OpenAI from 'openai';

function capitalizeSentenceStart(text) {
  if (!/[.!?]["')\]]?$/.test(text)) {
    return text;
  }

  const firstLetterIndex = text.search(/[A-Za-z]/);
  if (firstLetterIndex < 0) {
    return text;
  }

  return `${text.slice(0, firstLetterIndex)}${text[firstLetterIndex].toUpperCase()}${text.slice(firstLetterIndex + 1)}`;
}

function normalizeVocabularyItems(data) {
  if (!Array.isArray(data?.vocabulary)) {
    return [];
  }

  return data.vocabulary
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map(capitalizeSentenceStart);
}

export { capitalizeSentenceStart, normalizeVocabularyItems };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { imageUrls } = req.body || {};
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return res.status(400).json({ error: 'imageUrls must be a non-empty array.' });
  }
  if (!imageUrls.every((url) => typeof url === 'string' && /^https:\/\//i.test(url))) {
    return res.status(400).json({ error: 'Every image URL must be a valid HTTPS URL.' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured.' });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const messages = [
    {
      role: 'system',
      content: `You accurately transcribe English study material for an ESL teacher.
Return only a JSON object with this exact shape: {"vocabulary": ["item"]}.

Use normal, natural English capitalization. Never force an item's first letter to lowercase.
- Every complete sentence must begin with a capital letter and use appropriate ending punctuation.
- Keep ordinary vocabulary words and non-sentence phrases in their natural dictionary form.
- Preserve capitals for proper nouns, names, places, days, months, holidays, and titles.
- Correct obvious capitalization mistakes from handwriting when the intended English is clear.

Extract the requested vocabulary, phrases, and complete sentences from whiteboards and worksheets. Do not add explanations, labels, markdown, or items that are not present in the images.`
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Extract the English study items from these lesson images.'
        },
        ...imageUrls.map((url) => ({
          type: 'image_url',
          image_url: { url }
        }))
      ]
    }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.1
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'The vision model returned no text.' });
    }

    let data;
    try {
      data = JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse vision model output as JSON:', error);
      return res.status(502).json({ error: 'The vision model did not return valid JSON.' });
    }

    return res.status(200).json({
      processedData: {
        vocabulary: normalizeVocabularyItems(data)
      }
    });
  } catch (error) {
    console.error('Error calling the OpenAI vision API:', error);
    return res.status(500).json({ error: 'Could not extract text from the images.' });
  }
}
