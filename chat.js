// ==========================================
// Shanu AI — Chat Logic v4 (MERGED)
// Developer: Shiva Saini
//
// RESTORED from old:
//   ✅ marked.js — full GFM markdown rendering
//   ✅ preprocessImage() — canvas OCR pipeline (better accuracy)
//   ✅ initAuth + waitForAuth — Firebase auth race condition fix
//   ✅ .copy-code-btn / .msg-actions — correct CSS class names
//
// KEPT from new:
//   ✅ Multi-file upload (images, PDFs, code files)
//   ✅ Action Engine: [PDF] [PPT] [CHART] [PREVIEW] tags
//   ✅ jsPDF enhanced, PptxGenJS, Chart.js, Live Preview modal
//
// BUGS FIXED:
//   ✅ parseAndExecuteActions() was called twice — PDF/PPT generated 2x
//   ✅ Wrong CSS class .code-copy-btn → .copy-code-btn
//   ✅ Wrong hljs theme (atom-one-dark → github-dark, matches CSS)
// ==========================================

import { saveMessageToDB, loadHistoryFromDB, clearSessionDB, initAuth, waitForAuth } from './firebase.js';

// ------------------------------------------
// 1. DOM References
// ------------------------------------------
const chatBox          = document.getElementById("chat");
const inputBox         = document.getElementById("inputBox");
const sendBtn          = document.getElementById("sendBtn");
const sendIcon         = document.getElementById("sendIcon");
const clearBtn         = document.getElementById("clearBtn");
const newChatBtn       = document.getElementById("newChatBtn");
const emptyPlaceholder = document.getElementById("emptyPlaceholder");

// Mood
const moodBtn          = document.getElementById("moodBtn");
const moodList         = document.getElementById("moodList");
const currentMoodLabel = document.getElementById("currentMoodLabel");
const recentMoods      = document.getElementById("recentMoods");

// File Upload
const attachBtn        = document.getElementById("attachBtn");
const fileInput        = document.getElementById("fileInput");
const filePreviewBar   = document.getElementById("filePreviewBar");
const multiFileList    = document.getElementById("multiFileList");
const ocrProgressBar   = document.getElementById("ocrProgressBar");
const ocrProgressFill  = document.getElementById("ocrProgressFill");

// Mic
const micBtn           = document.getElementById("micBtn");
const micIcon          = document.getElementById("micIcon");

// Toast
const toast            = document.getElementById("toast");
const toastMsg         = document.getElementById("toastMsg");

// Mobile Sidebar
const menuBtn          = document.getElementById("menuBtn");
const sidebar          = document.getElementById("sidebar");
const sidebarOverlay   = document.getElementById("sidebarOverlay");

// Live Preview Modal
const previewModal         = document.getElementById("previewModal");
const previewFrame         = document.getElementById("previewFrame");
const previewModalBackdrop = document.getElementById("previewModalBackdrop");
const closePreviewBtn      = document.getElementById("closePreviewBtn");
const previewCopyBtn       = document.getElementById("previewCopyBtn");
const previewDownloadBtn   = document.getElementById("previewDownloadBtn");

// ------------------------------------------
// 2. Application State
// ------------------------------------------
let currentMood     = "normal";
let sending         = false;
let chatContext     = [];
let selectedFiles   = [];      // [{ file: File, status: string }]
let isRecording     = false;
let recognition     = null;
let toastTimer      = null;
let lastPreviewHTML = "";

// Code file extensions — read as text, wrapped in fenced blocks for AI
const CODE_EXTS = new Set([
    'c','cpp','h','hpp','cs','java','py','js','ts','jsx','tsx',
    'html','css','scss','sass','php','rb','go','rs','swift','kt',
    'r','sql','sh','bash','zsh','json','xml','yaml','yml',
    'toml','ini','cfg','env','md','makefile','dockerfile','gradle'
]);

const MOODS = [
    { value: "normal",     label: "😌 Normal"     },
    { value: "flirty",     label: "😉 Flirty"     },
    { value: "girlfriend", label: "❤️ Girlfriend"  },
    { value: "boyfriend",  label: "🛡️ Boyfriend"   },
    { value: "rude",       label: "😏 Sarcastic"   },
    { value: "baby",       label: "👶 Baby"        },
    { value: "roast",      label: "🔥 Roast"       },
    { value: "coach",      label: "💪 Coach"       },
];

// ------------------------------------------
// 3. Configure marked.js (RESTORED)
//    Full GFM: tables, lists, blockquotes, headings, links
// ------------------------------------------
if (window.marked) {
    marked.setOptions({
        breaks:    true,    // \n → <br>
        gfm:       true,    // GitHub Flavored Markdown
        headerIds: false,   // No auto-IDs (security)
        mangle:    false
    });
}

// ------------------------------------------
// 4. Toast
// ------------------------------------------
function showToast(msg, duration = 3200) {
    toastMsg.textContent = msg;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

// ------------------------------------------
// 5. Mood Dropdown
// ------------------------------------------
MOODS.forEach(m => {
    const div = document.createElement("div");
    div.className = "mood-item";
    div.textContent = m.label;
    div.addEventListener("click", () => {
        currentMood = m.value;
        currentMoodLabel.textContent = m.label;
        moodList.classList.remove("show");
        moodBtn.classList.remove("open");
        addToRecentMoods(m);
        showToast(`Mood changed to ${m.label}`);
    });
    moodList.appendChild(div);
});

moodBtn.addEventListener("click", e => {
    e.stopPropagation();
    moodList.classList.toggle("show");
    moodBtn.classList.toggle("open", moodList.classList.contains("show"));
});

document.addEventListener("click", () => {
    moodList.classList.remove("show");
    moodBtn.classList.remove("open");
});

function addToRecentMoods(moodObj) {
    if (Array.from(recentMoods.children).some(el => el.dataset.value === moodObj.value)) return;
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.dataset.value = moodObj.value;
    btn.innerHTML = `<i class="fa-solid fa-masks-theater" style="font-size:11px;opacity:0.7;"></i> ${moodObj.label}`;
    btn.onclick = () => {
        currentMood = moodObj.value;
        currentMoodLabel.textContent = moodObj.label;
        showToast(`Mood: ${moodObj.label}`);
    };
    recentMoods.prepend(btn);
    if (recentMoods.children.length > 3) recentMoods.lastChild.remove();
}

// ------------------------------------------
// 6. Mobile Sidebar
// ------------------------------------------
menuBtn?.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    sidebarOverlay.classList.toggle("show");
});
sidebarOverlay?.addEventListener("click", () => {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
});

// ------------------------------------------
// 7. Input Resize + Enter Key
// ------------------------------------------
function resizeInput() {
    inputBox.style.height = "auto";
    inputBox.style.height = Math.min(inputBox.scrollHeight, 130) + "px";
}
inputBox.addEventListener("input", resizeInput);
inputBox.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendAction();
    }
});

// ------------------------------------------
// 8. Chat UI Helpers
// ------------------------------------------
function scrollToBottom() {
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
}

function hidePlaceholder() {
    if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
}

function showTyping() {
    hidePlaceholder();
    const wrap = document.createElement("div");
    wrap.className = "typing-indicator";
    wrap.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>`;
    chatBox.appendChild(wrap);
    scrollToBottom();
    return wrap;
}

function lockUI() {
    sending = true;
    sendBtn.disabled = true;
    sendIcon.className = "fa-solid fa-spinner fa-spin";
}

function unlockUI() {
    sending = false;
    sendBtn.disabled = false;
    sendIcon.className = "fa-solid fa-paper-plane";
    inputBox.focus();
}

// ------------------------------------------
// 9. ✅ FIXED addMessage
//    Old bugs fixed:
//    1. parseAndExecuteActions() was called twice — now called ONCE
//    2. Uses marked.js (full markdown) instead of custom renderer
//    3. Uses .copy-code-btn (matches style.css) not .code-copy-btn
//    4. Uses .msg-actions bar (matches style.css)
//    5. parseActions=false for history load (no re-triggering old actions)
// ------------------------------------------
function addMessage(text, type = "bot", parseActions = true) {
    hidePlaceholder();
    const div = document.createElement("div");
    div.className = `msg ${type}`;

    if (type === "bot") {

        // ── Step 1: Parse action tags ONCE (BUG FIX: was called twice before) ──
        let displayText = text;
        let indicator   = null;

        if (parseActions) {
            const parsed = parseAndExecuteActions(text);
            displayText  = parsed.cleanText;
            indicator    = parsed.indicator;
        }

        // ── Step 2: Render full markdown via marked.js (RESTORED) ──
        if (window.marked) {
            div.innerHTML = marked.parse(displayText);
        } else {
            // Fallback if marked.js fails to load
            div.textContent = displayText;
        }

        // ── Step 3: Syntax highlight + copy button on each code block ──
        //    marked.js generates <pre><code class="language-X">
        //    We add .code-block-wrap to <pre> (matches CSS selector)
        div.querySelectorAll("pre code").forEach(block => {
            if (window.hljs) hljs.highlightElement(block);

            const pre  = block.parentElement;
            pre.classList.add("code-block-wrap");

            // Extract language label from hljs-added classes
            const lang = block.className
                .replace(/language-/g, "")
                .replace(/\s*hljs\s*/g, "")
                .trim() || "code";

            const header = document.createElement("div");
            header.className = "code-block-header";
            header.innerHTML = `
                <span class="code-lang-label">${lang}</span>
                <button class="copy-code-btn">
                    <i class="fa-solid fa-copy"></i> Copy
                </button>`;

            // ✅ Class is .copy-code-btn — matches style.css
            header.querySelector(".copy-code-btn").addEventListener("click", function () {
                navigator.clipboard.writeText(block.innerText).then(() => {
                    this.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                    setTimeout(() => {
                        this.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
                    }, 2000);
                });
            });

            pre.insertBefore(header, block);
        });

        // ── Step 4: Response action bar — Copy Response ──
        //    ✅ Uses .msg-actions + .msg-action-btn — matches style.css
        const actionBar = document.createElement("div");
        actionBar.className = "msg-actions";
        actionBar.innerHTML = `
            <button class="msg-action-btn copy-resp-btn" title="Copy full response">
                <i class="fa-solid fa-copy"></i> Copy
            </button>`;

        actionBar.querySelector(".copy-resp-btn").addEventListener("click", function () {
            navigator.clipboard.writeText(displayText).then(() => {
                this.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                showToast("✅ Response copied!");
                setTimeout(() => {
                    this.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
                }, 2000);
            });
        });

        div.appendChild(actionBar);
        chatBox.appendChild(div);

        // ── Step 5: Action indicator pill (e.g. "PDF downloaded") ──
        if (indicator) {
            const pill = document.createElement("div");
            pill.className = "action-result-pill";
            pill.innerHTML = indicator;
            chatBox.appendChild(pill);
        }

    } else {
        // User messages — plain text only (no XSS risk)
        div.textContent = text;
        chatBox.appendChild(div);
    }

    scrollToBottom();
    return div;
}

// ── File attachment bubble ────────────────────────────
function addFileBubbles() {
    hidePlaceholder();
    const iconMap  = { image: "fa-image", pdf: "fa-file-pdf", code: "fa-code", text: "fa-file-lines" };
    const labelMap = {
        image: "Image — OCR extracted",
        pdf:   "PDF — text extracted",
        code:  "Code file — analyzed",
        text:  "Text file — read"
    };

    selectedFiles.forEach(item => {
        const cat  = getFileCategory(item.file.type, item.file.name);
        const wrap = document.createElement("div");
        wrap.className = "msg file-msg user";
        wrap.innerHTML = `
            <div class="file-msg-card">
                <div class="file-msg-icon ${cat === "code" ? "text" : cat}">
                    <i class="fa-solid ${iconMap[cat] || "fa-file"}"></i>
                </div>
                <div class="file-msg-info">
                    <div class="file-msg-name">${item.file.name}</div>
                    <div class="file-msg-sub">${labelMap[cat] || "Attached"}</div>
                </div>
            </div>`;
        chatBox.appendChild(wrap);
    });
    scrollToBottom();
}

// ------------------------------------------
// 10. ✨ ACTION ENGINE — Tag Parser
//     ✅ BUG FIXED: Called only ONCE now (was called twice in old new version)
//     Tags: [PDF] [PPT] [CHART] [PREVIEW]
// ------------------------------------------
function parseAndExecuteActions(rawText) {
    let text      = rawText;
    let indicator = null;

    // [PDF]...[/PDF]
    const pdfMatch = text.match(/\[PDF\]([\s\S]*?)\[\/PDF\]/i);
    if (pdfMatch) {
        text = text.replace(pdfMatch[0], "").trim();
        generatePDF(pdfMatch[1].trim());
        indicator = `<i class="fa-solid fa-file-pdf"></i> PDF generated & downloaded`;
    }

    // [PPT]json[/PPT]
    const pptMatch = text.match(/\[PPT\]([\s\S]*?)\[\/PPT\]/i);
    if (pptMatch) {
        text = text.replace(pptMatch[0], "").trim();
        generatePPT(pptMatch[1].trim());
        indicator = `<i class="fa-solid fa-file-powerpoint"></i> Presentation downloaded`;
    }

    // [CHART]json[/CHART]
    const chartMatch = text.match(/\[CHART\]([\s\S]*?)\[\/CHART\]/i);
    if (chartMatch) {
        text = text.replace(chartMatch[0], "").trim();
        setTimeout(() => generateChart(chartMatch[1].trim()), 120);
        // No indicator pill — chart renders inline in chat
    }

    // [PREVIEW]html[/PREVIEW]
    const previewMatch = text.match(/\[PREVIEW\]([\s\S]*?)\[\/PREVIEW\]/i);
    if (previewMatch) {
        text = text.replace(previewMatch[0], "").trim();
        lastPreviewHTML = previewMatch[1].trim();
        setTimeout(() => showLivePreview(lastPreviewHTML), 150);
        indicator = `<i class="fa-solid fa-eye"></i> Live preview opened`;
    }

    // [IMAGE]prompt[/IMAGE]
    const imageMatch = text.match(/\[IMAGE\]([\s\S]*?)\[\/IMAGE\]/i);
    if (imageMatch) {
        text = text.replace(imageMatch[0], "").trim();
        setTimeout(() => generateImage(imageMatch[1].trim()), 120);
        // No indicator pill — image renders inline in chat bubble
    }

    return {
        cleanText: text.trim() || "✅ Done! Check above for your output.",
        indicator
    };
}

// ------------------------------------------
// 11. PDF Generator — Enhanced jsPDF
// ------------------------------------------
function generatePDF(content) {
    try {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) { showToast("⚠️ jsPDF not loaded yet. Try again."); return; }

        const doc    = new jsPDF({ unit: "mm", format: "a4" });
        const pageW  = doc.internal.pageSize.getWidth();
        const margin = 15;
        const useW   = pageW - margin * 2;

        // Header band
        doc.setFillColor(6, 8, 14);
        doc.rect(0, 0, pageW, 24, "F");
        doc.setTextColor(0, 229, 255);
        doc.setFontSize(15);
        doc.setFont("helvetica", "bold");
        doc.text("Shanu AI", margin, 15);
        doc.setTextColor(120, 130, 145);
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - margin, 15, { align: "right" });

        // Body
        doc.setTextColor(25, 25, 35);
        doc.setFontSize(11);
        let y = 33;

        const lines = doc.splitTextToSize(content, useW);
        lines.forEach(line => {
            if (y > 282) { doc.addPage(); y = 18; }
            const isHeading = line.trim().endsWith(":") || /^[A-Z\s]{6,}$/.test(line.trim());
            if (isHeading) {
                doc.setFont("helvetica", "bold");
                doc.setTextColor(0, 100, 180);
            } else {
                doc.setFont("helvetica", "normal");
                doc.setTextColor(25, 25, 35);
            }
            doc.text(line, margin, y);
            y += 6.5;
        });

        // Footer page numbers
        const total = doc.internal.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(160);
            doc.text(`${i} / ${total}`, pageW / 2, 292, { align: "center" });
        }

        doc.save("shanu-ai-output.pdf");
        showToast("📄 PDF downloaded!");
    } catch (e) {
        console.error("PDF Error:", e);
        showToast("⚠️ PDF generation failed.");
    }
}

// ------------------------------------------
// 12. PPT Generator — PptxGenJS
// ------------------------------------------
async function generatePPT(jsonStr) {
    try {
        if (typeof PptxGenJS === "undefined") {
            showToast("⚠️ PptxGenJS not loaded yet. Try again."); return;
        }

        const clean = jsonStr.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
        const data  = JSON.parse(clean);
        const pptx  = new PptxGenJS();
        pptx.layout = "LAYOUT_WIDE";

        const BG = "06080E", ACCENT = "00E5FF", WHITE = "F0F4FF", MUTED = "6B7280", INDIGO = "6366F1";

        // Title slide
        if (data.title) {
            const ts = pptx.addSlide();
            ts.background = { color: BG };
            ts.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.09, fill: { color: ACCENT } });
            ts.addShape(pptx.ShapeType.rect, { x: 0, y: 0.09, w: 0.06, h: "100%", fill: { color: INDIGO } });
            ts.addText(data.title, { x: 0.8, y: 1.4, w: 11, h: 1.6, fontSize: 42, bold: true, color: WHITE, fontFace: "Calibri" });
            if (data.subtitle) ts.addText(data.subtitle, { x: 0.8, y: 3.2, w: 11, h: 0.8, fontSize: 18, color: MUTED });
            ts.addText("Shanu AI", { x: 0.8, y: 6.6, w: 4, h: 0.4, fontSize: 9, color: INDIGO, italic: true });
        }

        // Content slides
        (data.slides || []).forEach((slide, idx) => {
            const s = pptx.addSlide();
            s.background = { color: BG };
            s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.07, fill: { color: ACCENT } });
            s.addText(String(idx + 1), { x: 11.8, y: 6.7, w: 0.6, h: 0.35, fontSize: 9, color: MUTED, align: "right" });
            if (slide.title) s.addText(slide.title, { x: 0.5, y: 0.25, w: 12, h: 1, fontSize: 28, bold: true, color: ACCENT, fontFace: "Calibri" });
            if (Array.isArray(slide.bullets) && slide.bullets.length > 0) {
                s.addText(slide.bullets.map(b => ({
                    text: String(b),
                    options: { bullet: { type: "bullet", indent: 12 }, color: WHITE, fontSize: 15 }
                })), { x: 0.5, y: 1.45, w: 12, h: 5.1, lineSpacingMultiple: 1.55 });
            } else if (slide.content) {
                s.addText(String(slide.content), { x: 0.5, y: 1.45, w: 12, h: 5.1, fontSize: 15, color: WHITE, lineSpacingMultiple: 1.55, wrap: true });
            }
        });

        await pptx.writeFile({ fileName: "shanu-ai-presentation.pptx" });
        showToast("📊 Presentation downloaded!");
    } catch (e) {
        console.error("PPT Error:", e);
        showToast("⚠️ PPT failed. Try saying 'retry PPT'.");
    }
}

// ------------------------------------------
// 12.5 Image Generator — Pollinations.ai (Free, no API key)
// ------------------------------------------
function generateImage(prompt) {
    if (!prompt) { showToast("⚠️ Image prompt empty."); return; }

    const wrap = document.createElement("div");
    wrap.className = "chart-wrap image-wrap";
    const uid  = `img_${Date.now()}`;
    const seed = Math.floor(Math.random() * 1000000);

    wrap.innerHTML = `
        <div class="chart-wrap-label">
            <i class="fa-solid fa-image" style="color:var(--primary)"></i>
            AI Generated Image
        </div>
        <div class="image-gen-box" id="${uid}">
            <div class="image-gen-loading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Painting your image...</span>
            </div>
        </div>
        <div class="image-gen-actions" style="display:none">
            <button class="msg-action-btn image-download-btn">
                <i class="fa-solid fa-download"></i> Download
            </button>
            <button class="msg-action-btn image-retry-btn">
                <i class="fa-solid fa-rotate"></i> Regenerate
            </button>
        </div>`;
    chatBox.appendChild(wrap);
    scrollToBottom();

    loadPollinationsImage(wrap, uid, prompt, seed);
}

function loadPollinationsImage(wrap, uid, prompt, seed) {
    const box     = wrap.querySelector(`#${uid}`);
    const actions = wrap.querySelector(".image-gen-actions");
    const url     = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&nologo=true`;

    const img = new Image();
    img.alt = prompt;
    img.className = "image-gen-result";

    img.onload = () => {
        box.innerHTML = "";
        box.appendChild(img);
        actions.style.display = "flex";
        scrollToBottom();
    };

    img.onerror = () => {
        box.innerHTML = `
            <div class="image-gen-error">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>Image generate nahi ho payi 😅</span>
                <button class="msg-action-btn image-retry-inline-btn">
                    <i class="fa-solid fa-rotate"></i> Try Again
                </button>
            </div>`;
        box.querySelector(".image-retry-inline-btn")?.addEventListener("click", () => {
            box.innerHTML = `<div class="image-gen-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>Painting your image...</span></div>`;
            loadPollinationsImage(wrap, uid, prompt, Math.floor(Math.random() * 1000000));
        });
    };

    img.src = url;

    // Wire up download + regenerate (fresh bind each load to avoid duplicates)
    const dlBtn    = wrap.querySelector(".image-download-btn");
    const retryBtn = wrap.querySelector(".image-retry-btn");

    dlBtn.onclick = () => {
        const a = document.createElement("a");
        a.href = url;
        a.download = `shanu-ai-image-${seed}.jpg`;
        a.target = "_blank";
        a.click();
        showToast("🖼️ Image download shuru ho gaya!");
    };

    retryBtn.onclick = () => {
        actions.style.display = "none";
        box.innerHTML = `<div class="image-gen-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>Painting your image...</span></div>`;
        loadPollinationsImage(wrap, uid, prompt, Math.floor(Math.random() * 1000000));
    };
}

// ------------------------------------------
// 13. Chart Generator — Chart.js
// ------------------------------------------
function generateChart(jsonStr) {
    try {
        if (typeof Chart === "undefined") { showToast("⚠️ Chart.js not loaded yet."); return; }

        const clean = jsonStr.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
        const data  = JSON.parse(clean);

        const wrap  = document.createElement("div");
        wrap.className = "chart-wrap";
        const uid = `chart_${Date.now()}`;
        wrap.innerHTML = `
            <div class="chart-wrap-label">
                <i class="fa-solid fa-chart-bar" style="color:var(--primary)"></i>
                ${data.title || "Data Visualization"}
            </div>
            <canvas id="${uid}"></canvas>`;
        chatBox.appendChild(wrap);
        scrollToBottom();

        const PALETTE = ["#00E5FF", "#6366f1", "#10B981", "#F59E0B", "#F43F5E", "#8B5CF6"];

        new Chart(document.getElementById(uid), {
            type: data.type || "bar",
            data: {
                labels: data.labels || [],
                datasets: (data.datasets || []).map((ds, i) => {
                    const color  = ds.color || PALETTE[i % PALETTE.length];
                    const isLine = ["line", "radar"].includes(data.type);
                    return {
                        label: ds.label || `Series ${i + 1}`,
                        data:  ds.data  || [],
                        backgroundColor: isLine ? color + "30" : color + "CC",
                        borderColor:     color,
                        borderWidth:     2,
                        borderRadius:    data.type === "bar" ? 6 : 0,
                        tension:         0.4,
                        fill:            isLine,
                        pointBackgroundColor: color,
                        pointRadius: 4
                    };
                })
            },
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: "#F0F4FF", font: { size: 12 }, padding: 16 } } },
                scales: ["pie", "doughnut"].includes(data.type) ? {} : {
                    x: { ticks: { color: "#9CA3AF", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.04)" } },
                    y: { ticks: { color: "#9CA3AF", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.06)" } }
                }
            }
        });
    } catch (e) {
        console.error("Chart Error:", e);
        showToast("⚠️ Chart data invalid. Try 'retry chart'.");
    }
}

// ------------------------------------------
// 14. Live Preview Modal
// ------------------------------------------
function showLivePreview(html) {
    lastPreviewHTML = html;
    const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    previewModal.classList.add("show");
}

closePreviewBtn?.addEventListener("click",      () => previewModal.classList.remove("show"));
previewModalBackdrop?.addEventListener("click", () => previewModal.classList.remove("show"));

previewCopyBtn?.addEventListener("click", () => {
    navigator.clipboard.writeText(lastPreviewHTML)
        .then(() => showToast("✅ HTML copied!"))
        .catch(() => showToast("⚠️ Copy failed."));
});

previewDownloadBtn?.addEventListener("click", () => {
    const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(new Blob([lastPreviewHTML], { type: "text/html" })),
        download: "shanu-ai-preview.html"
    });
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("📥 HTML downloaded!");
});

// ------------------------------------------
// 15. File Type Helpers
// ------------------------------------------
function getFileExtension(filename) {
    return (filename || "").split(".").pop().toLowerCase().trim();
}

function getFileCategory(mimeType, filename = "") {
    if (mimeType && mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/pdf")             return "pdf";
    if (CODE_EXTS.has(getFileExtension(filename)))  return "code";
    return "text";
}

const CHIP_ICON  = { image: "fa-file-image", pdf: "fa-file-pdf", code: "fa-code", text: "fa-file-lines" };
const CHIP_CLASS = { image: "image", pdf: "pdf", code: "code", text: "txt" };
const CHIP_LABEL = {
    image: "Image · OCR will extract text",
    pdf:   "PDF · text will be extracted",
    code:  "Code file · full content read",
    text:  "Text file · content read"
};

// ------------------------------------------
// 16. Multi-File Chip UI
// ------------------------------------------
function renderFileChips() {
    multiFileList.innerHTML = "";

    if (!selectedFiles.length) {
        filePreviewBar.classList.remove("show");
        return;
    }

    filePreviewBar.classList.add("show");

    selectedFiles.forEach((item, idx) => {
        const cat  = getFileCategory(item.file.type, item.file.name);
        const chip = document.createElement("div");
        chip.className = "file-chip";
        chip.innerHTML = `
            <div class="file-chip-icon ${CHIP_CLASS[cat] || "txt"}">
                <i class="fa-solid ${CHIP_ICON[cat] || "fa-file"}"></i>
            </div>
            <div class="file-chip-info">
                <span class="file-chip-name">${item.file.name}</span>
                <span class="file-chip-status" id="chipSt_${idx}">${CHIP_LABEL[cat]}</span>
            </div>
            <button class="file-chip-remove" data-idx="${idx}" title="Remove">
                <i class="fa-solid fa-xmark"></i>
            </button>`;
        multiFileList.appendChild(chip);
    });

    multiFileList.querySelectorAll(".file-chip-remove").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            selectedFiles.splice(parseInt(btn.dataset.idx), 1);
            renderFileChips();
            if (!selectedFiles.length) inputBox.placeholder = "Message Shanu AI...";
        });
    });
}

function setChipStatus(idx, msg, cls = "") {
    const el = document.getElementById(`chipSt_${idx}`);
    if (el) { el.textContent = msg; el.className = `file-chip-status ${cls}`; }
}

function updateProgress(pct) {
    ocrProgressBar.classList.add("show");
    ocrProgressFill.style.width = `${Math.min(pct, 100)}%`;
}

function clearAllFiles() {
    selectedFiles = [];
    ocrProgressBar.classList.remove("show");
    ocrProgressFill.style.width = "0%";
    renderFileChips();
    inputBox.placeholder = "Message Shanu AI...";
}

// ------------------------------------------
// 17. File Input Handler
// ------------------------------------------
attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", e => {
    const files    = Array.from(e.target.files || []);
    const big      = files.filter(f => f.size > 10 * 1024 * 1024);
    if (big.length) { showToast(`⚠️ Too large (max 10MB): ${big.map(f => f.name).join(", ")}`); fileInput.value = ""; return; }

    const existing = new Set(selectedFiles.map(i => i.file.name));
    const added    = files.filter(f => !existing.has(f.name));
    added.forEach(f => selectedFiles.push({ file: f, status: "" }));

    if (added.length) {
        renderFileChips();
        showToast(`📎 ${added.length} file${added.length > 1 ? "s" : ""} attached`);
        inputBox.placeholder = "Ask a question about these files (optional)...";
        inputBox.focus();
    } else {
        showToast("ℹ️ Files already attached.");
    }
    fileInput.value = "";
});

// ------------------------------------------
// 18. Send Router
// ------------------------------------------
async function handleSendAction() {
    if (sending) return;
    if (selectedFiles.length) { await processAndSendFiles(); return; }
    const text = inputBox.value.trim();
    if (!text) return;
    await sendTextMessage(text);
}

sendBtn.addEventListener("click", handleSendAction);

async function sendTextMessage(text) {
    addMessage(text, "user");
    inputBox.value = ""; resizeInput();
    chatContext.push({ role: "user", content: text });
    await saveMessageToDB("user", text);
    await callAPI();
}

// ------------------------------------------
// 19. API Call
// ------------------------------------------
async function callAPI() {
    lockUI();
    const typingEl = showTyping();
    try {
        const res  = await fetch("/api/ask", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ messages: chatContext.slice(-12), mood: currentMood })
        });
        const data = await res.json();
        typingEl.remove();
        const reply = data.reply || "Hmm... kuch samajh nahi aaya 🤔";
        addMessage(reply, "bot", true);
        chatContext.push({ role: "assistant", content: reply });
        await saveMessageToDB("assistant", reply);
    } catch (err) {
        console.error("API Error:", err);
        typingEl.remove();
        addMessage("❌ Network error! Please check your connection.", "bot", false);
    }
    unlockUI();
}

// ------------------------------------------
// 20. Multi-File Processing Pipeline
// ------------------------------------------
async function processAndSendFiles() {
    const question = inputBox.value.trim();
    inputBox.value = ""; resizeInput();
    addFileBubbles();
    lockUI();

    const total = selectedFiles.length;
    let combined = "";

    for (let i = 0; i < total; i++) {
        const { file } = selectedFiles[i];
        const cat = getFileCategory(file.type, file.name);
        const ext = getFileExtension(file.name);

        setChipStatus(i, "Processing...", "processing");
        updateProgress(Math.round((i / total) * 85));

        let text = "";
        try {
            if      (cat === "image") { setChipStatus(i, "Running OCR...",   "processing"); text = await extractTextFromImage(file, i, total); }
            else if (cat === "pdf")   { setChipStatus(i, "Extracting PDF...", "processing"); text = await extractTextFromPDF(file); }
            else                      { setChipStatus(i, "Reading file...",   "processing"); text = await readTextFile(file); }
            setChipStatus(i, "✅ Done", "done");
        } catch (err) {
            console.error(`Error on ${file.name}:`, err);
            setChipStatus(i, "❌ Failed", "error");
            text = "[File could not be read]";
        }

        const content = (cat === "code")
            ? `\`\`\`${ext}\n${text.trim().slice(0, 5000)}\n\`\`\``
            : text.trim().slice(0, 5000);

        combined += `\n\n${"=".repeat(50)}\nFILE ${i + 1} of ${total}: ${file.name}\n${"=".repeat(50)}\n${content}`;
    }

    updateProgress(100);

    let contextMsg = `[📎 ${total} file${total > 1 ? "s" : ""} uploaded]${combined}`;
    if (question) contextMsg += `\n\n${"─".repeat(40)}\nUser's Question: ${question}`;

    const dbSummary = `[Files: ${selectedFiles.map(i => i.file.name).join(", ")}]${question ? " — " + question : ""}`;

    chatContext.push({ role: "user", content: contextMsg });
    await saveMessageToDB("user", dbSummary);

    clearAllFiles();
    unlockUI();
    await callAPI();
}

// ------------------------------------------
// 21. ✅ RESTORED: preprocessImage (from old version)
//     File → ObjectURL → Canvas → Grayscale+Contrast boost → Tesseract
//     Much better OCR accuracy than passing raw file directly
// ------------------------------------------
async function preprocessImage(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img       = new Image();

        img.onload = () => {
            const MAX = 2000;
            let w = img.naturalWidth, h = img.naturalHeight;
            if (w > MAX || h > MAX) {
                const scale = MAX / Math.max(w, h);
                w = Math.floor(w * scale);
                h = Math.floor(h * scale);
            }

            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);

            // Grayscale + contrast boost (factor 1.5) for better OCR
            const imgData = ctx.getImageData(0, 0, w, h);
            const d = imgData.data;
            const C = 1.5;
            for (let i = 0; i < d.length; i += 4) {
                const gray    = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                const boosted = Math.max(0, Math.min(255, ((gray - 128) * C) + 128));
                d[i] = d[i + 1] = d[i + 2] = boosted;
            }
            ctx.putImageData(imgData, 0, 0);

            URL.revokeObjectURL(objectUrl);
            resolve(canvas);
        };

        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image load failed")); };
        img.src = objectUrl;
    });
}

async function extractTextFromImage(file, fileIdx, totalFiles) {
    setChipStatus(fileIdx, "Preprocessing...", "processing");
    const canvas = await preprocessImage(file);   // ✅ Canvas, not raw file
    updateProgress(Math.round(((fileIdx) / totalFiles) * 20) + 10);

    return new Promise((resolve, reject) => {
        Tesseract.recognize(canvas, "eng+hin", {
            logger: m => {
                if (m.status === "recognizing text") {
                    const base = (fileIdx / totalFiles) * 85;
                    const inc  = (m.progress / totalFiles) * 75;
                    updateProgress(Math.round(base + inc));
                    setChipStatus(fileIdx, `OCR ${Math.round(m.progress * 100)}%`, "processing");
                }
            }
        })
        .then(({ data: { text } }) => resolve(text))
        .catch(reject);
    });
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const typedArray  = new Uint8Array(arrayBuffer);
    const pdfjsLib    = window["pdfjs-dist/build/pdf"];
    if (!pdfjsLib) throw new Error("PDF.js not loaded");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
    let fullText = "";
    for (let p = 1; p <= pdf.numPages; p++) {
        const page    = await pdf.getPage(p);
        const content = await page.getTextContent();
        fullText += `\n[Page ${p}]\n` + content.items.map(i => i.str).join(" ");
    }
    return fullText;
}

async function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader    = new FileReader();
        reader.onload   = e => resolve(e.target.result || "");
        reader.onerror  = reject;
        reader.readAsText(file, "UTF-8");
    });
}

// ------------------------------------------
// 22. Microphone — Web Speech API
// ------------------------------------------
function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast("⚠️ Voice not supported. Use Chrome/Edge."); return false; }

    recognition = new SR();
    recognition.lang = "hi-IN"; recognition.interimResults = true; recognition.continuous = false;

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add("recording"); micIcon.className = "fa-solid fa-stop";
        inputBox.placeholder = "Listening... 🎙️";
        showToast("🎙️ Listening...");
    };

    recognition.onresult = e => {
        inputBox.value = Array.from(e.results).map(r => r[0].transcript).join("");
        resizeInput();
    };

    recognition.onend = () => {
        isRecording = false;
        micBtn.classList.remove("recording"); micIcon.className = "fa-solid fa-microphone";
        inputBox.placeholder = selectedFiles.length ? "Ask a question about these files (optional)..." : "Message Shanu AI...";
        const t = inputBox.value.trim();
        if (t) setTimeout(() => handleSendAction(), 350);
    };

    recognition.onerror = e => {
        isRecording = false;
        micBtn.classList.remove("recording"); micIcon.className = "fa-solid fa-microphone";
        const msgs = { "no-speech": "No speech detected.", "not-allowed": "Mic permission denied.", "network": "Network error." };
        showToast(`⚠️ ${msgs[e.error] || "Voice error."}`);
    };

    return true;
}

micBtn.addEventListener("click", () => {
    if (isRecording) { recognition?.stop(); return; }
    if (!recognition) { if (!initSpeechRecognition()) return; }
    try { recognition.start(); }
    catch { recognition.stop(); setTimeout(() => recognition.start(), 350); }
});

// ------------------------------------------
// 23. Clear & New Chat
// ------------------------------------------
clearBtn.addEventListener("click", async () => {
    if (!confirm("Bhai, saari chat delete kar doon? 🗑️")) return;
    await clearSessionDB();
});

newChatBtn.addEventListener("click", () => {
    inputBox.focus();
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
});

document.getElementById("settingsBtn")?.addEventListener("click", () => {
    showToast("⚙️ Settings — coming soon!");
});

// ------------------------------------------
// 24. ✅ RESTORED: Auth-safe initialization (from old version)
//     initAuth() → waitForAuth() → loadHistoryFromDB()
//     Fixes the race condition where history loaded before Firebase
//     anonymous auth resolved, causing empty/wrong history
// ------------------------------------------
async function initChat() {
    try {
        await initAuth();      // Trigger anonymous sign-in
        await waitForAuth();   // Block until auth state settles
        const history = await loadHistoryFromDB(30);

        if (history.length > 0) {
            if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
            history.forEach(m => {
                // parseActions = false → don't re-trigger PDF/PPT/Chart on load
                addMessage(m.content, m.role === "user" ? "user" : "bot", false);
                chatContext.push({ role: m.role, content: m.content });
            });
        }
    } catch (err) {
        console.error("Init error:", err);
    }
}

document.addEventListener("DOMContentLoaded", initChat);
