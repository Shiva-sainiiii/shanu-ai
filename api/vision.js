// ==========================================
// Shanu AI — Gemini Vision Proxy
// File: /api/vision.js  (Vercel Serverless Function)
// Developer: Shiva Saini
//
// Purpose: Image UNDERSTANDING (looking at photos/objects/scenes) via
//          Google's Gemini API (gemini-flash-latest). Pollinations had no
//          free vision endpoint that worked reliably, so vision moved to
//          Gemini (free tier, Google AI Studio key) — Pollinations stays
//          exactly as-is for IMAGE GENERATION (text.pollinations.ai /
//          image.pollinations.ai are untouched).
//
//          Called server-side (not directly from the browser) so the
//          Google API key never reaches the client, same pattern as
//          /api/ask.js uses for the OpenRouter key.
// ==========================================

const GEMINI_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

export default async function handler(req, res) {

    // ── CORS (for our own frontend calling this function) ──────
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")
        return res.status(405).json({ error: "Method not allowed" });

    // ── API Key ───────────────────────────────────────────────
    if (!process.env.GOOGLE_API_KEY)
        return res.status(500).json({ error: "Google API key missing 🔑 — set GOOGLE_API_KEY in Vercel env vars" });

    try {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const { imageBase64, question } = body || {};

        if (!imageBase64) {
            return res.status(400).json({ error: "No image provided" });
        }

        // ── imageBase64 arrives as a data URL from the frontend: ──
        //    "data:image/jpeg;base64,/9j/4AAQSkZJRgAB..."
        //    Gemini's inline_data wants the mime type and raw base64
        //    split apart, not the full data URL string.
        const match     = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageBase64);
        const mimeType  = match ? match[1] : "image/jpeg";
        const rawBase64 = match ? match[2] : imageBase64;

        console.log("Vision request — image size:", rawBase64.length, "mime:", mimeType);

        const payload = {
            contents: [{
                parts: [
                    {
                        text: question ||
                            "Describe exactly what you see in this image — objects, people, animals, scene, colors, mood. Be specific and concise."
                    },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: rawBase64
                        }
                    }
                ]
            }]
        };

        const response = await fetch(`${GEMINI_URL}?key=${process.env.GOOGLE_API_KEY}`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload)
        });

        if (response.status === 429) {
            return res.status(429).json({
                error: "Rate limited — Gemini's free tier allows limited requests per minute. Wait a moment and try again."
            });
        }

        if (!response.ok) {
            const errText = await response.text().catch(() => "");
            console.error("Gemini Vision error:", response.status, errText.slice(0, 300));
            return res.status(502).json({
                error: `Gemini Vision failed (${response.status})`
            });
        }

        const data = await response.json();
        console.log("Gemini Vision raw response:", JSON.stringify(data).slice(0, 800));

        const description = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!description) {
            console.error("Gemini Vision empty response:", JSON.stringify(data).slice(0, 300));
            // Gemini can return an empty candidate list with a block reason
            // instead of an error status (e.g. safety filters) — surface that.
            const blockReason = data?.promptFeedback?.blockReason;
            return res.status(502).json({
                error: blockReason
                    ? `Gemini blocked this image (${blockReason})`
                    : "Gemini Vision returned empty content"
            });
        }

        return res.status(200).json({ description });

    } catch (err) {
        console.error("Vision Handler Error:", err);
        return res.status(500).json({ error: "Vision backend crashed" });
    }
}
