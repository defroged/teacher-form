import OpenAI from "openai";

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
      - "japanese": the Japanese translation of that word or phrase,
      - "englishExample": an example sentence in English using that word or phrase,
      - "japaneseExample": a Japanese translation of that example sentence.

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

    return res.status(200).json({ processedList: data.vocabulary });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
