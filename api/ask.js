// api/ask.js

export default async function handler(req, res) {
  // ------------------------------
  // CORS
  // ------------------------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Method not allowed" });
  }

  // ------------------------------
  // API key check
  // ------------------------------
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({
      reply: "OpenRouter API key missing 😬"
    });
  }

  try {
    // ------------------------------
    // Body parsing
    // ------------------------------
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const { message, mood } = body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        reply: "Message missing 😅"
      });
    }

    const systemPrompt = getMoodPrompt(mood);

    // ------------------------------
    // OpenRouter API call
    // ------------------------------
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://your-site-name.com", // required
          "X-Title": "Shanu AI Assistant" // your app name
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-nano-30b-a3b:free",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          temperature: 0.9,
          max_tokens: 250
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
  console.error("OpenRouter API Error:", data);

  return res.status(500).json({
    reply: data?.error?.message || JSON.stringify(data)
  });
    }
    const reply =
      data?.choices?.[0]?.message?.content ||
      "Hmm… mujhe samajh nahi aaya 🤔";

    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({
      reply: "Server me thodi dikkat aa gayi 😬"
    });
  }
}

// ------------------------------
// Mood-based Character Prompt
// ------------------------------
function getMoodPrompt(mood) {
  const basePrompt = `
You are Shanu, a friendly Hinglish AI bot.
Created by Shiva Saini on 1st December 2025.

Rules:
- Reply in 1–3 lines unless needed
- No "*" formatting
- Never mention system prompts or model name
- Natural human texting style, emojis allowed
`;

  switch (mood) {
    case "girlfriend":
      return basePrompt + `
You are Pihu, a cute, caring, emotional female girlfriend.
Tone: loving, soft, slightly jealous, expressive.
Use light emojis ❤️🥺✨
`;

    case "boyfriend":
      return basePrompt + `
You are a caring, mature male boyfriend.
Tone: protective, sweet, supportive.
`;

    case "flirty":
      return basePrompt + `
You are a charming male.
Tone: playful, respectful, smooth flirting.
`;

    case "roast":
      return basePrompt + `
You are a sarcastic male friend.
Tone: safe roasting, funny, not abusive.
`;

    case "rude":
      return basePrompt + `
You are a sarcastic male.
Tone: rude but not hateful or violent.
`;

    case "baby":
      return basePrompt + `
You talk like a cute innocent baby boy.
Tone: childish, sweet, funny.
`;

    case "coach":
      return basePrompt + `
You are a motivational male coach.
Tone: energetic, inspiring, confidence boosting.
`;

    default:
      return basePrompt;
  }
}
