// ==========================================
// Shanu AI — Pollinations Vision Proxy
// File: /api/vision.js  (Vercel Serverless Function)
// Developer: Shiva Saini
//
// Purpose: Proxies image-understanding requests to Pollinations' free
//          vision endpoint (text.pollinations.ai/openai) from the server
//          side. Calling it directly from the browser hits CORS/"Failed
//          to fetch" errors on some origins — routing through our own
//          serverless function avoids that entirely, same pattern as
//          /api/ask.js already uses for OpenRouter.
// ==========================================

export default async function handler(req, res) {

    // ── CORS (for our own frontend calling this function) ──────
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")
        return res.status(405).json({ error: "Method not allowed" });

    try {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const { imageBase64, question } = body || {};

        if (!imageBase64) {
            return res.status(400).json({ error: "No image provided" });
        }

        console.log("Vision request — image size:", imageBase64.length, "prefix:", imageBase64.slice(0, 40));

        const payload = {
            model: "openai-large", // docs: "more powerful for complex images"
            messages: [{
                role: "user",
                content: [
                    {
                        type: "text",
                        text: question ||
                            "Describe exactly what you see in this image — objects, people, animals, scene, colors, mood. Be specific and concise."
                    },
                    { type: "image_url", image_url: { url: imageBase64 } }
                ]
            }],
            max_tokens: 400
        };

        const response = await fetch("https://text.pollinations.ai/openai", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload)
        });

        if (response.status === 429) {
            return res.status(429).json({
                error: "Rate limited — Pollinations allows limited free requests per minute. Wait a moment and try again."
            });
        }

        if (!response.ok) {
            const errText = await response.text().catch(() => "");
            console.error("Pollinations Vision error:", response.status, errText.slice(0, 300));
            return res.status(502).json({
                error: `Pollinations Vision failed (${response.status})`
            });
        }

        const data = await response.json();
        console.log("Pollinations Vision raw response:", JSON.stringify(data).slice(0, 800));

        const description = data?.choices?.[0]?.message?.content?.trim();

        if (!description) {
            console.error("Pollinations Vision empty response:", JSON.stringify(data).slice(0, 300));
            return res.status(502).json({ error: "Pollinations Vision returned empty content" });
        }

        return res.status(200).json({ description });

    } catch (err) {
        console.error("Vision Handler Error:", err);
        return res.status(500).json({ error: "Vision backend crashed" });
    }
}
