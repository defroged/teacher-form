import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { imageUrls } = req.body;
  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return res.status(400).json({ error: 'imageUrls is required and should be a non-empty array.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured.' });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Extract the requested data from these images and return ONLY pure JSON. Do not include triple backticks or code blocks. Use this JSON structure:
          {
            "vocabulary": []
          }
          Follow these instructions:

          1. For images of whiteboards and worksheets, etc.:
             - Analyze the content and extract vocabulary items, and add them to the "vocabulary" array.

          Images:`
        },
        ...imageUrls.map(url => ({
          type: "image_url",
          image_url: { url }
        }))
      ]
    }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages
    });

    const content = completion.choices[0].message.content;

    // Try to parse the content as JSON
    let data;
    try {
      data = JSON.parse(content);
    } catch (err) {
      console.error('Failed to parse model output as JSON:', err);
      return res.status(500).json({ error: 'Model did not return valid JSON.' });
    }

    // Ensure the 'hidden' array exists in case the model returns it
    if (!data.hidden) {
      data.hidden = [];
    }

    return res.status(200).json({ processedData: data, hidden: data.hidden });

  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
