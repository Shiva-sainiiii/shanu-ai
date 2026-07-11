// ==========================================
// Shanu AI — Cloudinary Upload Handler
// File: /api/upload.js  (Vercel Serverless Function)
// Developer: Shiva Saini
//
// Purpose: Uploads images (user-attached OR AI-generated) to Cloudinary
//          and returns a permanent hosted URL. Used for:
//          1. User-uploaded images (so chat history shows the real image,
//             not just OCR'd text)
//          2. AI-generated images (Pollinations URLs are not permanent —
//             this re-hosts them on Cloudinary so they survive forever
//             and load fast from a CDN)
//
// Uses an UNSIGNED upload preset — no API secret needed on the client,
// safe to call directly from the browser too, but routed through this
// serverless function to keep the cloud name/preset out of dev tools
// network tab noise and to allow future rate-limiting / validation.
// ==========================================

export default async function handler(req, res) {

    // ── CORS ──────────────────────────────────────────────────
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")
        return res.status(405).json({ error: "Method not allowed" });

    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
    const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET;

    if (!CLOUD_NAME || !UPLOAD_PRESET) {
        return res.status(500).json({ error: "Cloudinary not configured on server 🔑" });
    }

    try {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        // `source` can be:
        //   - a data: URL / base64 string (user-uploaded file)
        //   - a remote image URL (AI-generated image, e.g. from Pollinations)
        const { source, folder } = body || {};

        if (!source) {
            return res.status(400).json({ error: "No image source provided" });
        }

        const form = new FormData();
        form.append("file", source);
        form.append("upload_preset", UPLOAD_PRESET);
        form.append("folder", folder || "shanu-ai");

        const cloudRes = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
            { method: "POST", body: form }
        );

        const data = await cloudRes.json();

        if (!cloudRes.ok) {
            console.error("Cloudinary Error:", data);
            return res.status(500).json({ error: "Cloudinary upload failed 😅" });
        }

        return res.status(200).json({
            url:          data.secure_url,
            public_id:    data.public_id,
            width:        data.width,
            height:       data.height
        });

    } catch (err) {
        console.error("Upload Handler Error:", err);
        return res.status(500).json({ error: "Upload backend crashed 💥" });
    }
}
