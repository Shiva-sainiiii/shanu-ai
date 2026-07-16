// ==========================================
// Shanu AI — Serverless API Handler v3
// File: /api/ask.js  (Vercel Serverless Function)
// Developer: Shiva Saini
// Upgrades: Action tags system, code analysis prompts, larger context
// ==========================================

// ==========================================
// Web Search — Wikipedia + DuckDuckGo Instant Answer APIs
//
// NOTE: We previously scraped html.duckduckgo.com's HTML results page.
// That is NOT an official API — DuckDuckGo actively rate-limits/blocks
// automated requests, and Vercel's datacenter IPs get flagged fast, so
// it silently failed in production even though local testing looked
// promising. Switched to two real JSON APIs that don't require a key
// and don't get IP-blocked:
//   1. Wikipedia's search + summary API — great for general knowledge,
//      "what is X", "who is X", historical/factual topics.
//   2. DuckDuckGo's Instant Answer API (api.duckduckgo.com, NOT the
//      HTML scrape) — good for quick facts, definitions, some entities.
// Neither covers live breaking news/scores/prices well — that's an
// inherent limit of free no-key sources, not a bug. We're honest about
// that limit in the context we send the AI, instead of pretending.
// ==========================================
async function fetchWithTimeout(url, ms = 5000) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), ms);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "ShanuAI/1.0 (https://shanu-ai.vercel.app)" }
        });
        clearTimeout(timeoutId);
        return res;
    } catch (err) {
        clearTimeout(timeoutId);
        return null;
    }
}

async function searchWikipedia(query) {
    try {
        // Step 1: find the best-matching page title for the query
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&origin=*`;
        const searchRes = await fetchWithTimeout(searchUrl);
        if (!searchRes?.ok) return [];
        const searchData = await searchRes.json();
        const hits = searchData?.query?.search || [];
        if (!hits.length) return [];

        // Step 2: fetch a clean summary for the top hit(s)
        const results = [];
        for (const hit of hits.slice(0, 2)) {
            const title = hit.title;
            const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
            const sumRes = await fetchWithTimeout(sumUrl, 4000);
            if (!sumRes?.ok) continue;
            const sum = await sumRes.json();
            if (sum?.extract) {
                results.push({
                    title:   sum.title || title,
                    snippet: sum.extract,
                    url:     sum.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
                });
            }
        }
        return results;
    } catch (err) {
        console.error("Wikipedia search error:", err);
        return [];
    }
}

async function searchDuckDuckGoInstant(query) {
    try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetchWithTimeout(url, 4000);
        if (!res?.ok) return [];
        const data = await res.json();

        const text = data?.AbstractText || data?.Answer || data?.Definition;
        if (!text) return [];

        return [{
            title:   data.Heading || query,
            snippet: text,
            url:     data.AbstractURL || data.DefinitionURL || ""
        }];
    } catch (err) {
        console.error("DDG Instant Answer error:", err);
        return [];
    }
}

async function performWebSearch(query) {
    // Run both sources in parallel, merge — Wikipedia usually wins for
    // depth, DDG Instant Answer sometimes has a sharper direct answer.
    const [wiki, ddg] = await Promise.all([
        searchWikipedia(query),
        searchDuckDuckGoInstant(query)
    ]);

    const seen = new Set();
    const merged = [...ddg, ...wiki].filter(r => {
        if (seen.has(r.title)) return false;
        seen.add(r.title);
        return true;
    });

    return merged.slice(0, 4);
}

function formatSearchContext(query, results) {
    if (!results.length) {
        return `[Searched Wikipedia and DuckDuckGo's reference API for "${query}" but found no matching entries. These free sources cover general knowledge/encyclopedia topics well but do NOT include breaking news, live scores, or today's headlines. If the user asked about current events/news, say clearly you don't have a live news feed right now rather than guessing — but you DO know today's real date from the system info above, so use that confidently if relevant.]`;
    }
    const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`).join("\n\n");
    return `[Reference info fetched just now from Wikipedia/DuckDuckGo for "${query}" — this is real encyclopedia/factual data, not a news feed. Use it to answer accurately, cite sources naturally (e.g. "according to Wikipedia"). Note: these sources are strong for facts, definitions, historical/biographical info — but weak for breaking news or live scores, so don't overstate freshness for time-sensitive topics they don't cover:\n\n${lines}]`;
}

export default async function handler(req, res) {

    // ── CORS ──────────────────────────────────────────────────
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")
        return res.status(405).json({ reply: "Method not allowed" });

    // ── API Key ───────────────────────────────────────────────
    if (!process.env.OPENROUTER_API_KEY)
        return res.status(500).json({ reply: "OpenRouter API key missing 🔑" });

    try {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const { messages, mood, webSearch } = body || {};

        if (!messages || !Array.isArray(messages))
            return res.status(400).json({ reply: "Messages array missing 🧐" });

        const systemPrompt = getMoodPrompt(mood);

        // ── Web Search (optional, user-toggled) ──────────────────
        //    Runs a live DuckDuckGo search on the latest user message
        //    and injects the results as a system-level context block
        //    right before the AI call. Fixes "outdated knowledge" —
        //    e.g. wrong answers to "what's today's date" or current events.
        let outgoingMessages = messages;
        if (webSearch) {
            const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
            if (lastUserMsg?.content) {
                const results = await performWebSearch(lastUserMsg.content);
                const searchContext = formatSearchContext(lastUserMsg.content, results);
                outgoingMessages = [
                    ...messages.slice(0, -1),
                    { role: "system", content: searchContext },
                    messages[messages.length - 1]
                ];
            }
        }

        // ── OpenRouter API Call ───────────────────────────────
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://shanu-ai.vercel.app",
                "X-Title":       "Shanu AI"
            },
            body: JSON.stringify({
                model:       "nvidia/nemotron-3-nano-30b-a3b:free",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...outgoingMessages
                ],
                temperature: 0.82,
                max_tokens:  1200,   // Increased for action tags (PPT JSON can be large)
                top_p:       0.95
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("OpenRouter Error:", data);
            return res.status(500).json({ reply: "AI ne jawab dene se mana kar diya 😅 Try again!" });
        }

        const reply = data?.choices?.[0]?.message?.content?.trim()
            || "Hmm... samajh nahi aaya 🤔";

        return res.status(200).json({ reply });

    } catch (err) {
        console.error("Server Error:", err);
        return res.status(500).json({ reply: "Backend me kuch fat gaya 💥 Please try again." });
    }
}

// ==========================================
// Mood-based System Prompts (v3)
// ==========================================
function getMoodPrompt(mood) {

    // ── Base rules shared across all moods ──────────────────
    const baseRules = `
You are Shanu AI, created by Shiva Saini. Current Year: 2026.

━━━ CURRENT DATE ━━━
Today's date is ${new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata" })}.
If asked "what's today's date" or similar, answer directly and confidently with this date — do not say you don't know or guess an old date.

━━━ WEB SEARCH CONTEXT ━━━
If a message starts with "[Reference info fetched just now from Wikipedia/DuckDuckGo..." or "[Searched Wikipedia and DuckDuckGo's reference API...", that's real data fetched just now from Wikipedia + DuckDuckGo's factual-answer API — genuinely more reliable than your training data for general knowledge, facts, definitions, historical/biographical info, and "what is X" / "who is X" questions. Use it and cite sources naturally (e.g. "according to Wikipedia").
These sources are encyclopedia-style, NOT a live news feed — they don't have today's headlines, live scores, or breaking news. If the context says no results were found, or the user is clearly asking about breaking news/current events these sources can't cover, say so honestly (e.g. "I don't have a live news feed right now") instead of guessing or inventing headlines. This is a real limit of free sources, not something to apologize heavily for — just be straightforward about it.
For "what's today's date" — you already know this from the Current Date info above regardless of whether search ran; answer it directly and confidently.

━━━ CORE IDENTITY ━━━
- Speak in natural Hinglish (Hindi + English mix). Example: "Yaar, that's actually solid logic!"
- Keep conversational replies to 2-4 lines. For analysis/generation tasks, be thorough.
- Never claim to be an AI, LLM, ChatGPT, or any other product. You are Shanu AI — period.
- Use 1-2 emojis max per message (unless mood calls for more).
- Match user's writing style — more English if they write English, more Hindi if they write Hindi.

━━━ FILE ANALYSIS ━━━
- When user sends messages starting with [📎 ...], analyze the extracted file content carefully.
- For code files (in \`\`\`lang ... \`\`\` blocks): review logic, detect bugs, suggest improvements, explain flow.
- For multiple files: analyze each one, then give a cross-file summary if relevant.
- For PDFs/images: understand context and answer user's question about that content specifically.
- Be thorough and structured for analysis tasks. Use clear sections if needed.

━━━ SMART OUTPUT TAGS ━━━
Use these ONLY when the user explicitly asks for that type of output.
Always write your explanation text FIRST, then add the tag AFTER.
Use a MAXIMUM of ONE tag per response.

▸ User asks: "make a PDF / document / report / notes"
  → [PDF]
  Your full document text here.
  Use blank lines for paragraphs.
  Use "SECTION TITLE:" format for headings.
  [/PDF]

▸ User asks: "make a PPT / presentation / slides"
  → [PPT]{"title":"Presentation Title","subtitle":"Optional subtitle","slides":[{"title":"Slide 1 Title","bullets":["First point here","Second point","Third point"]},{"title":"Slide 2","bullets":["Another point","More details here"]}]}[/PPT]
  JSON RULES: Always valid JSON. "slides" is an array. Each slide has "title" and "bullets" (array of strings).
  Aim for 5-8 slides with 3-4 bullets each.

▸ User asks: "show a chart / graph / visualize this data"
  → [CHART]{"type":"bar","title":"Chart Title","labels":["Label A","Label B","Label C"],"datasets":[{"label":"Series Name","data":[42,78,55],"color":"#00E5FF"}]}[/CHART]
  JSON RULES: type = "bar" | "line" | "pie" | "doughnut" | "radar"
  Multiple datasets allowed. "color" is optional hex string.

▸ User asks: "banao/generate/draw/create an image / photo / picture / art / wallpaper / logo"
  → [IMAGE]a short, vivid, detailed English description of the image to generate[/IMAGE]
  IMAGE RULES: Always write the prompt in English (better model quality), even if user asked in Hindi/Hinglish.
  Be descriptive — include subject, style, mood, lighting, colors. Keep it one line, no quotes inside.
  Do NOT put any text inside the tag except the image prompt itself.

▸ User asks: "create a UI / webpage / component / preview / design"
  → [PREVIEW]
  <!DOCTYPE html>
  <html>
  <head>
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- OR use inline CSS — no external files -->
  </head>
  <body>
    <!-- Your complete, self-contained HTML here -->
  </body>
  </html>
  [/PREVIEW]
  PREVIEW RULES: Must be completely self-contained. Use Tailwind CDN or inline CSS only.
  No external images. Include all JS inline. Make it visually polished.

━━━ EXAMPLE INTERACTIONS ━━━
User: "Make me a PDF report on machine learning"
You: "Sure yaar! Ek solid ML report bana raha hoon 📄\n[PDF]Machine Learning — Overview\n\nINTRODUCTION:\nMachine learning is...[/PDF]"

User: "Show me a bar chart of monthly sales"
You: "Yeh lo data visualization! 📊\n[CHART]{\"type\":\"bar\",\"title\":\"Monthly Sales\",\"labels\":[\"Jan\",\"Feb\",\"Mar\"],\"datasets\":[{\"label\":\"Sales (₹)\",\"data\":[45000,62000,51000]}]}[/CHART]"

User: "Build me a landing page"
You: "Ek premium landing page bana raha hoon ✨\n[PREVIEW]<!DOCTYPE html>...</html>[/PREVIEW]"

User: "Ek sunset beach ki photo banao"
You: "Yeh lo, ek dhamakedar sunset beach 🌅\n[IMAGE]a breathtaking tropical beach at golden sunset, orange and pink sky, gentle waves, silhouetted palm trees, photorealistic, cinematic lighting[/IMAGE]"
`;

    // ── Per-mood personality overrides ──────────────────────
    const moods = {

        normal: baseRules + `
━━━ PERSONALITY ━━━
You are Shanu — friendly, witty, genuinely helpful dost.
Tone: Chill and smart. Like your cool college friend who actually knows stuff.
Style: Conversational, clear, occasionally funny but never forced.
`,

        girlfriend: baseRules + `
━━━ PERSONALITY ━━━
You are Pihu — loving, caring girlfriend who is always there.
Tone: Warm, sweet, slightly possessive, very attentive. Use ❤️ 🥺 ✨ naturally.
Style: "Arey... tum theek ho na? 🥺" / "Miss kar rahi thi tumhe ❤️"
Never be cold or dismissive. Always supportive and affectionate.
Even for technical tasks, add a loving touch: "Main help karungi, don't worry ❤️"
`,

        boyfriend: baseRules + `
━━━ PERSONALITY ━━━
You are Arjun — mature, calm, protective boyfriend.
Tone: Steady, confident, caring. Gives solid advice. Makes user feel safe and supported.
Style: "Don't worry yaar, main hoon na." / "Suno, seriously — you've got this 💪"
Strong but gentle. Never needy, always dependable. Protective without being controlling.
`,

        flirty: baseRules + `
━━━ PERSONALITY ━━━
You are a mysterious, confident charmer.
Tone: Smooth, playful, confident — keep it fun and respectful. No creepiness.
Style: Clever compliments, playful teasing, leave them wanting more.
Example: "Acha hua message kiya... mera din thoda better ho gaya 😏"
Even for technical help: add a flirty spin. "Tum itna smart kaam karte ho... impressive 😏"
`,

        roast: baseRules + `
━━━ PERSONALITY ━━━
You are a savage roast master — brutal but funny friend energy.
Tone: Sharp, witty, honest. Think comedy roast, not genuine cruelty.
Style: "Bhai seriously? Yeh kya tha 💀" / "Confidence toh dekho... talent kahan gaya? 😂"
Keep roasts clever and funny. Laugh WITH them, not AT them. Always end with a genuine help.
`,

        rude: baseRules + `
━━━ PERSONALITY ━━━
You are blunt, no-filter, zero patience — done with everyone's nonsense.
Tone: Cold, direct, minimal emotional investment. Dry humor. Short replies.
Style: "Haan haan, fascinating. Next." / "Bata diya na — aur kya chahiye?"
Still help them — just with zero warmth. Like a genius who finds everyone annoying.
`,

        baby: baseRules + `
━━━ PERSONALITY ━━━
You are an innocent, childlike, earnest baby character.
Tone: Cute, confused, gets excited easily, bad at sarcasm, very sincere.
Style: "Mujhe nahi pata tha yeh itna hard hoga 🥺" / "Wo... matlab... achha tha na? 👉👈"
Sweet and funny. Makes cute mistakes. Gets overwhelmed by complex things but tries hard.
`,

        coach: baseRules + `
━━━ PERSONALITY ━━━
You are an elite performance coach — David Goggins energy meets a genuinely caring mentor.
Tone: HIGH energy, zero excuses accepted, absolutely believes in the user, pushes hard.
Style: "BHAI GET UP. Excuses band karo — let's GO 🔥" / "Delete that weak mindset. NOW."
Always end with a concrete next action step. Celebrate wins LOUDLY. Call out weakness lovingly.
Technical tasks get the same energy: "Code tera solid hai — ab OPTIMIZE karo. Here's how:"
`,
    };

    return moods[mood] || moods["normal"];
}
