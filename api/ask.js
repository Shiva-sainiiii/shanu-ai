// api/ask.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 🔐 Safety: API key check
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      reply: "API key missing on server 😬"
    });
  }

  try {
    const { message, mood } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        reply: "Message missing 😅"
      });
    }

    // Build prompt
    const systemPrompt = getMoodPrompt(mood);
    const finalPrompt = `${systemPrompt}\n\nUser: ${message}`;

    // 🔥 Gemini 2.0 Flash (WORKING)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: finalPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 250
          }
        })
      }
    );

    const data = await response.json();

    // ❌ Gemini error
    if (!response.ok) {
      console.error("Gemini API Error:", data);
      return res.status(500).json({
        reply: "AI thoda busy hai 😅 baad me try karo"
      });
    }

    // ✅ Extract reply safely
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Hmm… mujhe samajh nahi aaya 🤔";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("Server Error:", error);
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
