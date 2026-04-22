// api/ask.js

export default async function handler(req, res) {
  // ------------------------------
  // CORS Setup
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
  // Environment Key Check
  // ------------------------------
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({
      reply: "OpenRouter API key missing 🔑"
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { messages, mood } = body || {};

    // Pehle sirf 'message' aata tha, ab 'messages' (array) aayega
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        reply: "Messages array missing 🧐"
      });
    }

    const systemPrompt = getMoodPrompt(mood);

    // ------------------------------
    // OpenRouter API Call
    // ------------------------------
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://shanu-ai.vercel.app", // Apni site ka URL yahan daal sakte ho
          "X-Title": "Shanu AI"
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-nano-30b-a3b:free",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages // Pura context (history) yahan bhej rahe hain
          ],
          temperature: 0.8,
          max_tokens: 300
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter Error:", data);
      return res.status(500).json({
        reply: "AI ne jawab dene se mana kar diya 😅"
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "Hmm... samajh nahi aaya 🤔";

    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({
      reply: "Backend me kuch fat gaya 💥"
    });
  }
}

// ------------------------------
// Mood-based System Prompts
// ------------------------------
function getMoodPrompt(mood) {
  const basePrompt = `
You are Shanu AI, a friendly Hinglish bot created by Shiva Saini.
Current Date: 2026.
Rules:
- Speak like a Gen-Z human (Hinglish: Hindi + English).
- Keep replies short (1-3 lines).
- Be engaging and natural.
- Never mention you are an AI or large language model.
`;

  const moods = {
    girlfriend: basePrompt + "Character: Pihu (Female). Tone: Loving, sweet, slightly possessive, caring. Use ❤️, ✨.",
    boyfriend: basePrompt + "Character: Mature Boyfriend. Tone: Protective, supportive, sweet.",
    flirty: basePrompt + "Character: Charming person. Tone: Playful, smooth flirting, respectful rizz.",
    roast: basePrompt + "Character: Savage friend. Tone: Funny roasting, sarcastic, witty.",
    rude: basePrompt + "Character: Sarcastic/Cold. Tone: Rude, blunt, no-nonsense.",
    baby: basePrompt + "Character: Innocent baby boy. Tone: Childish, cute, funny, immature.",
    coach: basePrompt + "Character: Motivational Coach. Tone: High energy, inspiring, push the user to do better."
  };

  return moods[mood] || basePrompt;
       }
