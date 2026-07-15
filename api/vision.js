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

// NOTE ON THE 503 BUG:
// "gemini-flash-latest" is an ALIAS. Google routes a huge share of
// free-tier traffic through aliases, so they get overloaded and return
// 503 ("model overloaded") way more often than a pinned version does.
// Fix: try a pinned stable version first, and if THAT 503s too, fall
// back to other models automatically instead of failing the request.
const GEMINI_MODELS = [
    "gemini-2.0-flash",       // pinned stable — primary
    "gemini-flash-latest",    // alias — fallback #1
    "gemini-2.0-flash-lite"   // lighter/less contended — fallback #2
];

function geminiUrl(model) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

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

        // ── Try each model in order. On 503 (overloaded), move to the
        //    next one in the list instead of failing immediately. ──
        let response, lastStatus, lastErrText = "";

        for (const model of GEMINI_MODELS) {
            response = await fetch(`${geminiUrl(model)}?key=${process.env.GOOGLE_API_KEY}`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(payload)
            });

            if (response.ok) {
                console.log(`Gemini Vision succeeded using model: ${model}`);
                break;
            }

            lastStatus = response.status;
            lastErrText = await response.text().catch(() => "");
            console.error(`Gemini Vision (${model}) error:`, lastStatus, lastErrText.slice(0, 300));

            // 429 = rate limited, no point trying other models, same key/quota
            if (lastStatus === 429) break;

            // 503 = overloaded → try next model in the list
            // Any other error (400, 404 etc) → also try next model, cheap to attempt
        }

        if (lastStatus === 429) {
            return res.status(429).json({
                error: "Rate limited — Gemini's free tier allows limited requests per minute. Wait a moment and try again."
            });
        }

        if (!response.ok) {
            return res.status(502).json({
                error: `Gemini Vision failed on all models (last: ${lastStatus}). Try again in a moment — Google's free tier gets overloaded sometimes.`
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
