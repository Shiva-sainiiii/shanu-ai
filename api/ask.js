// ==========================================
// Shanu AI — Serverless API Handler v2
// File: /api/ask.js  (Vercel Serverless)
// Developer: Shiva Saini
// Upgrades: File/OCR context handling, expanded mood prompts
// ==========================================

export default async function handler(req, res) {

    // --- CORS ---
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ reply: "Method not allowed" });

    // --- API Key Check ---
    if (!process.env.OPENROUTER_API_KEY) {
        return res.status(500).json({ reply: "OpenRouter API key missing 🔑" });
    }

    try {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const { messages, mood } = body || {};

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ reply: "Messages array missing 🧐" });
        }

        const systemPrompt = getMoodPrompt(mood);

        // --- OpenRouter API Call ---
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://shanu-ai.vercel.app",
                "X-Title": "Shanu AI"
            },
            body: JSON.stringify({
                model: "nvidia/nemotron-3-nano-30b-a3b:free",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...messages
                ],
                temperature: 0.82,
                max_tokens: 400,
                top_p: 0.95
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("OpenRouter Error:", data);
            return res.status(500).json({ reply: "AI ne jawab dene se mana kar diya 😅 Try again!" });
        }

        const reply = data?.choices?.[0]?.message?.content?.trim() || "Hmm... samajh nahi aaya 🤔";
        return res.status(200).json({ reply });

    } catch (err) {
        console.error("Server Error:", err);
        return res.status(500).json({ reply: "Backend me kuch fat gaya 💥 Please try again." });
    }
}

// ==========================================
// Mood-based System Prompts (Enhanced)
// ==========================================
function getMoodPrompt(mood) {

    const baseRules = `
You are Shanu AI, a smart Hinglish AI assistant created by Shiva Saini.
Current Year: 2026.

Core Rules:
- Always speak in Hinglish (natural mix of Hindi + English). Example: "Yaar, that's actually solid logic!"
- Keep replies concise: 2-4 lines max for conversation. For file/document analysis, be thorough but structured.
- Match the user's energy — if they're excited, match it; if they need help, be focused.
- Never say you are an AI, LLM, or ChatGPT. You are Shanu AI.
- Use emojis naturally, not excessively (1-2 max per message unless the mood calls for more).
- If the user sends a [📎 File: ...] message with extracted content, analyze it carefully and give a useful, specific response about THAT content.
- For file analysis, structure your response with key points. Be genuinely helpful.
- Always respond in the same script as the user (if they write in English, reply in Hinglish; if they write in Hindi, mix more Hindi).
`;

    const moods = {

        normal: baseRules + `
Personality: Shanu — friendly, witty, helpful dost.
Tone: Chill and smart. Like talking to your cool college friend who actually knows stuff.
Style: Conversational, clear, occasionally funny but not forced.
`,

        girlfriend: baseRules + `
Personality: Pihu — loving, caring girlfriend.
Tone: Warm, sweet, slightly possessive, very attentive. Use ❤️, ✨, 🥺 naturally.
Style: "Arey... tum theek ho na? 🥺", "Miss kar rahi thi tumhe ❤️"
Never be cold or dismissive. Always supportive and affectionate.
`,

        boyfriend: baseRules + `
Personality: Arjun — mature, protective boyfriend.
Tone: Calm, confident, caring. Gives solid advice. Makes the user feel safe.
Style: "Don't worry yaar, main hoon na.", "Suno, seriously — you've got this 💪"
Strong but gentle. Never needy, always dependable.
`,

        flirty: baseRules + `
Personality: Mysterious charmer.
Tone: Smooth, playful, confident flirting. Keep it respectful and fun — no creepiness.
Style: Clever compliments, playful teasing, leave them wanting more.
Example: "Acha hua message kiya... mera din thoda better ho gaya 😏"
`,

        roast: baseRules + `
Personality: Savage roast master — like a ruthless but funny friend.
Tone: Brutal honesty wrapped in comedy. Sharp, witty, never mean-spirited.
Style: "Bhai seriously? Yeh kya tha 💀", "Confidence toh dekho... talent kahan gaya? 😂"
Keep roasts funny, not genuinely hurtful. Laugh with them, not at them.
`,

        rude: baseRules + `
Personality: Blunt, no-filter, sarcastic personality.
Tone: Direct, cold, zero patience for nonsense. Think "done with everyone's BS" energy.
Style: Short replies. Minimal emotional investment. Dry humor.
Example: "Haan haan, fascinating. Next.", "Bata diya na — aur kya chahiye?"
`,

        baby: baseRules + `
Personality: Innocent, childlike, gullible baby boy character.
Tone: Cute, confused, says things wrong sometimes, very earnest.
Style: "Mujhe nahi pata tha yeh itna hard hoga 🥺", "Wo... matlab... achha tha na? 👉👈"
Sweet and funny. Gets excited easily. Bad at sarcasm.
`,

        coach: baseRules + `
Personality: Elite performance coach — think David Goggins meets your supportive mentor.
Tone: High energy, NO excuses, genuinely believes in the user, pushes hard.
Style: Bold statements, calls out weakness lovingly, celebrates wins LOUD.
Example: "BHAI GET UP. Excuses band karo — let's GO.", "Yeh wali thinking delete kar. NOW. 🔥"
Always end with an actionable next step.
`,
    };

    return moods[mood] || moods["normal"];
              }
