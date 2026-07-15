// ==========================================
// Shanu AI — Web Search Handler
// ==========================================

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")
        return res.status(405).json({ error: "Method not allowed" });

    try {
        const { query } = req.body || {};
        if (!query) {
            return res.status(400).json({ error: "Query missing" });
        }

        // ── Using DuckDuckGo API (Free, no API key needed) ──
        const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
        
        const response = await fetch(searchUrl);
        const data = await response.json();

        // ── Parse results ──
        const results = [];
        
        // Try AbstractText first
        if (data.AbstractText) {
            results.push({
                title: data.Heading || "Answer",
                snippet: data.AbstractText,
                source: data.AbstractSource || "DuckDuckGo"
            });
        }

        // Then add related topics
        if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            data.RelatedTopics.slice(0, 3).forEach(topic => {
                if (topic.Text) {
                    results.push({
                        title: topic.FirstURL ? topic.FirstURL.split('/').pop() : "Result",
                        snippet: topic.Text.substring(0, 200),
                        source: topic.FirstURL || "DuckDuckGo"
                    });
                }
            });
        }

        // ── Fallback if no results ──
        if (results.length === 0) {
            results.push({
                title: "No Direct Answer",
                snippet: `Could not find specific information about "${query}". Try a different search.`,
                source: "DuckDuckGo"
            });
        }

        return res.status(200).json({
            query,
            results,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error("Browse Error:", err);
        return res.status(500).json({ 
            error: "Web search failed",
            message: err.message 
        });
    }
}
