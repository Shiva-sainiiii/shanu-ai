// ==========================================
// Shanu AI — Chat Logic v3
// Developer: Shiva Saini
// Action Engine: PDF | PPT | Chart | Preview
// Multi-file: Images (OCR) | PDFs | Code | Text
// ==========================================

import { saveMessageToDB, loadHistoryFromDB, clearSessionDB } from './firebase.js';

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

// File Upload (multi-file)
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

// Mobile sidebar
const menuBtn          = document.getElementById("menuBtn");
const sidebar          = document.getElementById("sidebar");
const sidebarOverlay   = document.getElementById("sidebarOverlay");

// Preview Modal
const previewModal          = document.getElementById("previewModal");
const previewFrame          = document.getElementById("previewFrame");
const previewModalBackdrop  = document.getElementById("previewModalBackdrop");
const closePreviewBtn       = document.getElementById("closePreviewBtn");
const previewCopyBtn        = document.getElementById("previewCopyBtn");
const previewDownloadBtn    = document.getElementById("previewDownloadBtn");

// ------------------------------------------
// 2. Application State
// ------------------------------------------
let currentMood   = "normal";
let sending       = false;
let chatContext   = [];           // Full conversation for API
let selectedFiles = [];           // [{ file: File, status: string }]
let isRecording   = false;
let recognition   = null;
let toastTimer    = null;
let lastPreviewHTML = "";         // For copy/download buttons

// Code extensions — read as plain text, wrapped in code fences
const CODE_EXTS = new Set([
    'c','cpp','h','hpp','cs','java','py','js','ts','jsx','tsx',
    'html','css','scss','sass','php','rb','go','rs','swift','kt',
    'r','sql','sh','bash','zsh','json','xml','yaml','yml',
    'toml','ini','cfg','env','makefile','dockerfile','gradle'
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
// 3. Toast Notification
// ------------------------------------------
function showToast(msg, duration = 3200) {
    toastMsg.textContent = msg;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

// ------------------------------------------
// 4. Mood Dropdown
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

moodBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = moodList.classList.toggle("show");
    moodBtn.classList.toggle("open", isOpen);
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
// 5. Mobile Sidebar
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
// 6. Input Auto-resize + Enter Key
// ------------------------------------------
function resizeInput() {
    inputBox.style.height = "auto";
    inputBox.style.height = Math.min(inputBox.scrollHeight, 130) + "px";
}
inputBox.addEventListener("input", resizeInput);
inputBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendAction();
    }
});

// ------------------------------------------
// 7. Chat UI Helpers
// ------------------------------------------
function scrollToBottom() {
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
}

function hidePlaceholder() {
    if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
}

/**
 * Add a message bubble to the chat.
 * @param {string} text - Message content
 * @param {"user"|"bot"} type
 * @param {boolean} parseActions - Set false when loading history (avoids re-triggering actions)
 */
function addMessage(text, type = "bot", parseActions = true) {
    hidePlaceholder();
    const div = document.createElement("div");
    div.className = `msg ${type}`;

    if (type === "bot") {
        const rawText = parseActions ? parseAndExecuteActions(text).cleanText : text;
        const indicator = parseActions ? parseAndExecuteActions(text).indicator : null;

        // Render rich markdown content (code blocks + inline formatting)
        div.innerHTML = renderBotMarkdown(rawText);

        // ── Copy button (always shown on bot messages) ──────
        const copyBtn = document.createElement("button");
        copyBtn.className = "msg-copy-btn";
        copyBtn.title = "Copy message";
        copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i>`;
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(rawText).then(() => {
                copyBtn.innerHTML = `<i class="fa-solid fa-check"></i>`;
                copyBtn.classList.add("copied");
                setTimeout(() => {
                    copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i>`;
                    copyBtn.classList.remove("copied");
                }, 1800);
            });
        });
        div.appendChild(copyBtn);
        chatBox.appendChild(div);

        // Apply highlight.js to all code blocks inside this message
        div.querySelectorAll("pre code").forEach(block => {
            if (window.hljs) hljs.highlightElement(block);
        });

        // Attach per-block copy buttons after hljs runs
        div.querySelectorAll(".code-block-wrap").forEach(wrap => {
            const btn = wrap.querySelector(".code-copy-btn");
            const code = wrap.querySelector("code");
            btn?.addEventListener("click", () => {
                navigator.clipboard.writeText(code.innerText).then(() => {
                    btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
                    btn.classList.add("copied");
                    setTimeout(() => {
                        btn.innerHTML = `<i class="fa-regular fa-copy"></i> Copy`;
                        btn.classList.remove("copied");
                    }, 1800);
                });
            });
        });

        if (indicator) {
            const pill = document.createElement("div");
            pill.className = "action-result-pill";
            pill.innerHTML = indicator;
            chatBox.appendChild(pill);
        }
    } else {
        // User messages — plain text only
        div.textContent = text;
        chatBox.appendChild(div);
    }

    scrollToBottom();
    return div;
}

/**
 * Converts bot response text into rich HTML.
 * Handles: fenced code blocks, inline code, bold, italic, plain text.
 * Keeps action tags stripped (they're already handled).
 */
function renderBotMarkdown(text) {
    // Split on fenced code blocks: ```lang\n...code...\n```
    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts.map(part => {
        // ── Fenced code block ───────────────────────────────
        const fenceMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
        if (fenceMatch) {
            const lang    = fenceMatch[1]?.trim() || "plaintext";
            const code    = escapeHtml(fenceMatch[2] || "");
            const langLabel = lang !== "plaintext" ? lang : "code";
            return `
<div class="code-block-wrap">
    <div class="code-block-header">
        <span class="code-lang-label">${langLabel}</span>
        <button class="code-copy-btn">
            <i class="fa-regular fa-copy"></i> Copy
        </button>
    </div>
    <pre><code class="language-${lang}">${code}</code></pre>
</div>`;
        }

        // ── Plain text segment — apply inline markdown ──────
        let html = escapeHtml(part);

        // Inline code: `code`
        html = html.replace(/`([^`]+)`/g,
            (_, c) => `<code class="inline-code">${c}</code>`);

        // Bold: **text** or __text__
        html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/__(.+?)__/g,      "<strong>$1</strong>");

        // Italic: *text* or _text_
        html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
        html = html.replace(/_([^_]+)_/g,   "<em>$1</em>");

        // Preserve newlines as <br>
        html = html.replace(/\n/g, "<br>");

        return html;
    }).join("");
}

/** Safely escape HTML special chars before injecting into DOM */
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function addFileBubbles() {
    hidePlaceholder();
    const iconMap = { image: "fa-image", pdf: "fa-file-pdf", code: "fa-code", text: "fa-file-lines" };
    const labelMap = {
        image: "Image — OCR extracted",
        pdf:   "PDF — text extracted",
        code:  "Code file — analyzed",
        text:  "Text file — read"
    };
    selectedFiles.forEach(item => {
        const cat = getFileCategory(item.file.type, item.file.name);
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
// 8. ✨ ACTION ENGINE — Smart Tag Parser
// ------------------------------------------
/**
 * Parses AI response for [TAG]...[/TAG] blocks and triggers actions.
 * Returns cleaned text (without tags) + optional UI indicator.
 *
 * Supported tags:
 *   [PDF]content[/PDF]       → Downloads a PDF via jsPDF
 *   [PPT]json[/PPT]          → Downloads a PPTX via PptxGenJS
 *   [CHART]json[/CHART]      → Renders a Chart.js chart in chat
 *   [PREVIEW]html[/PREVIEW]  → Opens HTML in live preview modal
 */
function parseAndExecuteActions(rawText) {
    let text = rawText;
    let indicator = null;

    // ── [PDF] ──────────────────────────────────────────────────
    const pdfMatch = text.match(/\[PDF\]([\s\S]*?)\[\/PDF\]/i);
    if (pdfMatch) {
        text = text.replace(pdfMatch[0], "").trim();
        generatePDF(pdfMatch[1].trim());
        indicator = `<i class="fa-solid fa-file-pdf"></i> PDF generated & downloaded`;
    }

    // ── [PPT] ──────────────────────────────────────────────────
    const pptMatch = text.match(/\[PPT\]([\s\S]*?)\[\/PPT\]/i);
    if (pptMatch) {
        text = text.replace(pptMatch[0], "").trim();
        generatePPT(pptMatch[1].trim());
        indicator = `<i class="fa-solid fa-file-powerpoint"></i> Presentation downloaded`;
    }

    // ── [CHART] ────────────────────────────────────────────────
    const chartMatch = text.match(/\[CHART\]([\s\S]*?)\[\/CHART\]/i);
    if (chartMatch) {
        text = text.replace(chartMatch[0], "").trim();
        setTimeout(() => generateChart(chartMatch[1].trim()), 120);
    }

    // ── [PREVIEW] ──────────────────────────────────────────────
    const previewMatch = text.match(/\[PREVIEW\]([\s\S]*?)\[\/PREVIEW\]/i);
    if (previewMatch) {
        text = text.replace(previewMatch[0], "").trim();
        lastPreviewHTML = previewMatch[1].trim();
        setTimeout(() => showLivePreview(lastPreviewHTML), 150);
        indicator = `<i class="fa-solid fa-eye"></i> Live preview opened`;
    }

    return {
        cleanText: text || "✅ Done! Check above for your output.",
        indicator
    };
}

// ------------------------------------------
// 9. PDF Generator — jsPDF
// ------------------------------------------
function generatePDF(content) {
    try {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) { showToast("⚠️ jsPDF not loaded yet. Try again."); return; }

        const doc = new jsPDF({ unit: "mm", format: "a4" });
        const pageW = doc.internal.pageSize.getWidth();
        const margin = 15;
        const usableW = pageW - margin * 2;

        // ── Header band ──
        doc.setFillColor(6, 8, 14);
        doc.rect(0, 0, pageW, 24, "F");
        doc.setTextColor(0, 229, 255);
        doc.setFontSize(15);
        doc.setFont("helvetica", "bold");
        doc.text("Shanu AI", margin, 15);
        doc.setTextColor(120, 130, 145);
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.text("Generated by Shanu AI — Shiva Saini", pageW - margin, 15, { align: "right" });

        // ── Body ──
        doc.setTextColor(25, 25, 35);
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        let y = 33;

        const lines = doc.splitTextToSize(content, usableW);
        lines.forEach(line => {
            if (y > 282) { doc.addPage(); y = 18; }
            // Simple heading detection (lines ending with ':' or ALL CAPS)
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

        // ── Footer ──
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
// 10. PPT Generator — PptxGenJS
// ------------------------------------------
async function generatePPT(jsonStr) {
    try {
        if (typeof PptxGenJS === "undefined") {
            showToast("⚠️ PptxGenJS not loaded yet. Try again."); return;
        }

        // Strip markdown code fences if AI wraps JSON
        const clean = jsonStr.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
        const data = JSON.parse(clean);

        const pptx = new PptxGenJS();
        pptx.layout  = "LAYOUT_WIDE";

        // Theme colors
        const BG     = "06080E";
        const ACCENT = "00E5FF";
        const WHITE  = "F0F4FF";
        const MUTED  = "6B7280";
        const INDIGO = "6366F1";

        // ── Title Slide ──────────────────────────────────────
        if (data.title) {
            const tSlide = pptx.addSlide();
            tSlide.background = { color: BG };

            // Accent bar
            tSlide.addShape(pptx.ShapeType.rect, {
                x: 0, y: 0, w: "100%", h: 0.09,
                fill: { color: ACCENT }
            });
            // Decorative side stripe
            tSlide.addShape(pptx.ShapeType.rect, {
                x: 0, y: 0.09, w: 0.06, h: "100%",
                fill: { color: INDIGO }
            });

            tSlide.addText(data.title, {
                x: 0.8, y: 1.4, w: 11, h: 1.6,
                fontSize: 42, bold: true, color: WHITE, fontFace: "Calibri"
            });
            if (data.subtitle) {
                tSlide.addText(data.subtitle, {
                    x: 0.8, y: 3.2, w: 11, h: 0.8,
                    fontSize: 18, color: MUTED
                });
            }
            tSlide.addText("Shanu AI", {
                x: 0.8, y: 6.6, w: 4, h: 0.4,
                fontSize: 9, color: INDIGO, italic: true
            });
        }

        // ── Content Slides ────────────────────────────────────
        (data.slides || []).forEach((slide, idx) => {
            const s = pptx.addSlide();
            s.background = { color: BG };

            // Accent bar
            s.addShape(pptx.ShapeType.rect, {
                x: 0, y: 0, w: "100%", h: 0.07,
                fill: { color: ACCENT }
            });

            // Slide number
            s.addText(String(idx + 1), {
                x: 11.8, y: 6.7, w: 0.6, h: 0.35,
                fontSize: 9, color: MUTED, align: "right"
            });

            // Title
            if (slide.title) {
                s.addText(slide.title, {
                    x: 0.5, y: 0.25, w: 12, h: 1,
                    fontSize: 28, bold: true, color: ACCENT, fontFace: "Calibri"
                });
            }

            // Bullets (preferred) or plain content
            if (Array.isArray(slide.bullets) && slide.bullets.length > 0) {
                const items = slide.bullets.map(b => ({
                    text: String(b),
                    options: { bullet: { type: "bullet", indent: 12 }, color: WHITE, fontSize: 15 }
                }));
                s.addText(items, {
                    x: 0.5, y: 1.45, w: 12, h: 5.1,
                    lineSpacingMultiple: 1.55
                });
            } else if (slide.content) {
                s.addText(String(slide.content), {
                    x: 0.5, y: 1.45, w: 12, h: 5.1,
                    fontSize: 15, color: WHITE,
                    lineSpacingMultiple: 1.55, wrap: true
                });
            }
        });

        await pptx.writeFile({ fileName: "shanu-ai-presentation.pptx" });
        showToast("📊 Presentation downloaded!");
    } catch (e) {
        console.error("PPT Error:", e);
        showToast("⚠️ PPT failed — AI may have returned invalid JSON. Try: 'retry PPT'");
    }
}

// ------------------------------------------
// 11. Chart Generator — Chart.js
// ------------------------------------------
function generateChart(jsonStr) {
    try {
        if (typeof Chart === "undefined") {
            showToast("⚠️ Chart.js not loaded yet. Try again."); return;
        }

        const clean = jsonStr.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
        const data = JSON.parse(clean);

        // Build chart wrapper bubble
        const wrap = document.createElement("div");
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

        const PALETTE = ["#00E5FF","#6366f1","#10B981","#F59E0B","#F43F5E","#8B5CF6"];

        new Chart(document.getElementById(uid), {
            type: data.type || "bar",
            data: {
                labels: data.labels || [],
                datasets: (data.datasets || []).map((ds, i) => {
                    const color = ds.color || PALETTE[i % PALETTE.length];
                    const isLine = (data.type === "line" || data.type === "radar");
                    return {
                        label: ds.label || `Series ${i + 1}`,
                        data: ds.data || [],
                        backgroundColor: isLine ? color + "30" : color + "CC",
                        borderColor: color,
                        borderWidth: 2,
                        borderRadius: data.type === "bar" ? 6 : 0,
                        tension: 0.4,
                        fill: isLine,
                        pointBackgroundColor: color,
                        pointRadius: 4
                    };
                })
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: { color: "#F0F4FF", font: { size: 12 }, padding: 16 }
                    }
                },
                scales: ["pie","doughnut"].includes(data.type) ? {} : {
                    x: {
                        ticks: { color: "#9CA3AF", font: { size: 11 } },
                        grid: { color: "rgba(255,255,255,0.04)" }
                    },
                    y: {
                        ticks: { color: "#9CA3AF", font: { size: 11 } },
                        grid: { color: "rgba(255,255,255,0.06)" }
                    }
                }
            }
        });
    } catch (e) {
        console.error("Chart Error:", e);
        showToast("⚠️ Chart data invalid. Try: 'retry chart'");
    }
}

// ------------------------------------------
// 12. Live Preview Modal
// ------------------------------------------
function showLivePreview(htmlContent) {
    lastPreviewHTML = htmlContent;
    const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();
    previewModal.classList.add("show");
}

closePreviewBtn?.addEventListener("click", () => previewModal.classList.remove("show"));
previewModalBackdrop?.addEventListener("click", () => previewModal.classList.remove("show"));

previewCopyBtn?.addEventListener("click", () => {
    navigator.clipboard.writeText(lastPreviewHTML)
        .then(() => showToast("✅ HTML copied to clipboard!"))
        .catch(() => showToast("⚠️ Copy failed — try manually."));
});

previewDownloadBtn?.addEventListener("click", () => {
    const blob = new Blob([lastPreviewHTML], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "shanu-ai-preview.html";
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("📥 HTML file downloaded!");
});

// ------------------------------------------
// 13. File Type Helpers
// ------------------------------------------
function getFileExtension(filename) {
    return (filename || "").split(".").pop().toLowerCase().trim();
}

function getFileCategory(mimeType, filename = "") {
    if (mimeType && mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/pdf") return "pdf";
    const ext = getFileExtension(filename);
    if (CODE_EXTS.has(ext)) return "code";
    return "text";
}

const CATEGORY_ICON = { image: "fa-file-image", pdf: "fa-file-pdf", code: "fa-code", text: "fa-file-lines" };
const CATEGORY_STATUS = {
    image: "Image · OCR will extract text",
    pdf:   "PDF · text will be extracted",
    code:  "Code file · full content read",
    text:  "Text file · content read"
};
const CHIP_ICON_CLASS = { image: "image", pdf: "pdf", code: "code", text: "txt" };

// ------------------------------------------
// 14. Multi-File UI — Chip Renderer
// ------------------------------------------
function renderFileChips() {
    multiFileList.innerHTML = "";

    if (selectedFiles.length === 0) {
        filePreviewBar.classList.remove("show");
        return;
    }

    filePreviewBar.classList.add("show");

    selectedFiles.forEach((item, idx) => {
        const cat = getFileCategory(item.file.type, item.file.name);
        const chip = document.createElement("div");
        chip.className = "file-chip";
        chip.dataset.idx = idx;
        chip.innerHTML = `
            <div class="file-chip-icon ${CHIP_ICON_CLASS[cat] || "txt"}">
                <i class="fa-solid ${CATEGORY_ICON[cat] || "fa-file"}"></i>
            </div>
            <div class="file-chip-info">
                <span class="file-chip-name">${item.file.name}</span>
                <span class="file-chip-status" id="chipSt_${idx}">${item.status || CATEGORY_STATUS[cat]}</span>
            </div>
            <button class="file-chip-remove" data-idx="${idx}" title="Remove">
                <i class="fa-solid fa-xmark"></i>
            </button>`;
        multiFileList.appendChild(chip);
    });

    // Remove file on × click
    multiFileList.querySelectorAll(".file-chip-remove").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const i = parseInt(btn.dataset.idx);
            selectedFiles.splice(i, 1);
            renderFileChips();
            if (selectedFiles.length === 0) inputBox.placeholder = "Message Shanu AI...";
        });
    });
}

function setChipStatus(idx, msg, cssClass = "") {
    const el = document.getElementById(`chipSt_${idx}`);
    if (!el) return;
    el.textContent = msg;
    el.className = `file-chip-status ${cssClass}`;
}

function updateOcrProgress(percent) {
    ocrProgressBar.classList.add("show");
    ocrProgressFill.style.width = `${Math.min(percent, 100)}%`;
}

function clearAllFiles() {
    selectedFiles = [];
    ocrProgressBar.classList.remove("show");
    ocrProgressFill.style.width = "0%";
    renderFileChips();
    inputBox.placeholder = "Message Shanu AI...";
}

// ------------------------------------------
// 15. File Input Handler
// ------------------------------------------
attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
    const newFiles = Array.from(e.target.files || []);
    if (!newFiles.length) return;

    const oversized = newFiles.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length) {
        showToast(`⚠️ Too large (max 10MB): ${oversized.map(f => f.name).join(", ")}`);
        fileInput.value = "";
        return;
    }

    // Deduplicate by filename
    const existing = new Set(selectedFiles.map(i => i.file.name));
    const added = [];
    newFiles.forEach(f => {
        if (!existing.has(f.name)) {
            selectedFiles.push({ file: f, status: "" });
            added.push(f.name);
        }
    });

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
// 16. Core Send Router
// ------------------------------------------
async function handleSendAction() {
    if (sending) return;
    if (selectedFiles.length > 0) { await processAndSendFiles(); return; }
    const text = inputBox.value.trim();
    if (!text) return;
    await sendTextMessage(text);
}

sendBtn.addEventListener("click", handleSendAction);

// ------------------------------------------
// 17. Plain Text Send
// ------------------------------------------
async function sendTextMessage(text) {
    addMessage(text, "user");
    inputBox.value = "";
    resizeInput();
    chatContext.push({ role: "user", content: text });
    await saveMessageToDB("user", text);
    await callAPI();
}

// ------------------------------------------
// 18. API Call (uses chatContext internally)
// ------------------------------------------
async function callAPI() {
    lockUI();
    const typingEl = showTyping();

    try {
        const res = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: chatContext.slice(-12),
                mood: currentMood
            })
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
// 19. ✨ Multi-File Processing Pipeline
// ------------------------------------------
async function processAndSendFiles() {
    const userQuestion = inputBox.value.trim();
    inputBox.value = "";
    resizeInput();

    // Show file bubbles in chat
    addFileBubbles();
    lockUI();

    const total = selectedFiles.length;
    let combined = "";

    for (let i = 0; i < total; i++) {
        const { file } = selectedFiles[i];
        const cat = getFileCategory(file.type, file.name);
        const ext = getFileExtension(file.name);

        setChipStatus(i, "Processing...", "processing");
        updateOcrProgress(Math.round(((i) / total) * 85));

        let text = "";
        try {
            if (cat === "image") {
                setChipStatus(i, "Running OCR...", "processing");
                text = await extractTextFromImage(file, i, total);
            } else if (cat === "pdf") {
                setChipStatus(i, "Extracting PDF...", "processing");
                text = await extractTextFromPDF(file);
            } else {
                setChipStatus(i, "Reading file...", "processing");
                text = await readTextFile(file);
            }
            setChipStatus(i, "✅ Done", "done");
        } catch (err) {
            console.error(`Error on ${file.name}:`, err);
            setChipStatus(i, "❌ Failed", "error");
            text = "[File could not be read]";
        }

        // Wrap code in fenced block for cleaner AI analysis
        const content = (cat === "code")
            ? `\`\`\`${ext}\n${text.trim().slice(0, 5000)}\n\`\`\``
            : text.trim().slice(0, 5000);

        combined += `\n\n${"=".repeat(50)}\nFILE ${i + 1} of ${total}: ${file.name}\n${"=".repeat(50)}\n${content}`;
    }

    updateOcrProgress(100);

    // Build final context message
    let contextMsg = `[📎 ${total} file${total > 1 ? "s" : ""} uploaded]${combined}`;
    if (userQuestion) contextMsg += `\n\n${"─".repeat(40)}\nUser's Question: ${userQuestion}`;

    // Simple summary for DB (avoids storing huge text)
    const dbSummary = `[Files: ${selectedFiles.map(i => i.file.name).join(", ")}]${userQuestion ? " — " + userQuestion : ""}`;

    chatContext.push({ role: "user", content: contextMsg });
    await saveMessageToDB("user", dbSummary);

    clearAllFiles();

    // Now call API (already locked, callAPI will lock again — unlock first)
    unlockUI();
    await callAPI();
}

// ------------------------------------------
// 20. OCR + Extraction Functions
// ------------------------------------------
async function extractTextFromImage(file, fileIdx, totalFiles) {
    return new Promise((resolve, reject) => {
        Tesseract.recognize(file, "eng+hin", {
            logger: (m) => {
                if (m.status === "recognizing text") {
                    const base = (fileIdx / totalFiles) * 85;
                    const inc  = (m.progress / totalFiles) * 85;
                    updateOcrProgress(Math.round(base + inc));
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

    const pdfjsLib = window["pdfjs-dist/build/pdf"];
    if (!pdfjsLib) throw new Error("PDF.js not loaded");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
    let fullText = "";

    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        fullText += `\n[Page ${p}]\n` + content.items.map(i => i.str).join(" ");
    }
    return fullText;
}

async function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = (e) => resolve(e.target.result || "");
        reader.onerror = reject;
        reader.readAsText(file, "UTF-8");
    });
}

// ------------------------------------------
// 21. Microphone — Web Speech API
// ------------------------------------------
function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast("⚠️ Voice not supported. Use Chrome/Edge."); return false; }

    recognition = new SR();
    recognition.lang            = "hi-IN";
    recognition.interimResults  = true;
    recognition.continuous      = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add("recording");
        micIcon.className = "fa-solid fa-stop";
        inputBox.placeholder = "Listening... 🎙️";
        showToast("🎙️ Listening...");
    };

    recognition.onresult = (e) => {
        inputBox.value = Array.from(e.results).map(r => r[0].transcript).join("");
        resizeInput();
    };

    recognition.onend = () => {
        isRecording = false;
        micBtn.classList.remove("recording");
        micIcon.className = "fa-solid fa-microphone";
        inputBox.placeholder = selectedFiles.length > 0
            ? "Ask a question about these files (optional)..."
            : "Message Shanu AI...";
        const t = inputBox.value.trim();
        if (t) setTimeout(() => handleSendAction(), 350);
    };

    recognition.onerror = (e) => {
        isRecording = false;
        micBtn.classList.remove("recording");
        micIcon.className = "fa-solid fa-microphone";
        const msgs = {
            "no-speech":   "No speech detected.",
            "not-allowed": "Mic permission denied.",
            "network":     "Network error."
        };
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
// 22. Clear & New Chat
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
// 23. Init — Load history from Firebase
// ------------------------------------------
async function initChat() {
    try {
        const history = await loadHistoryFromDB(20);
        if (history.length > 0) {
            if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
            history.forEach(m => {
                // parseActions = false → don't re-trigger old PDF/PPT/Chart actions
                addMessage(m.content, m.role === "user" ? "user" : "bot", false);
                chatContext.push({ role: m.role, content: m.content });
            });
        }
    } catch (err) {
        console.error("Init error:", err);
    }
}

document.addEventListener("DOMContentLoaded", initChat);
