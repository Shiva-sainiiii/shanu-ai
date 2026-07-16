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

import { saveMessageToDB, loadHistoryFromDB, clearSessionDB, initAuth, waitForAuth, loadLocalHistorySync } from './firebase.js';

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

// Bloom Mode (inline image generation / description) — now toggled from + sheet
const bloomOptsRow     = document.getElementById("bloomOptsRow");

// Plus menu (Add to chat) — Claude-style bottom sheet
const plusBtn            = document.getElementById("plusBtn");
const plusSheet          = document.getElementById("plusSheet");
const plusSheetBackdrop  = document.getElementById("plusSheetBackdrop");
const plusSheetClose     = document.getElementById("plusSheetClose");
const plusCameraBtn      = document.getElementById("plusCameraBtn");
const plusPhotosBtn      = document.getElementById("plusPhotosBtn");
const plusFilesBtn       = document.getElementById("plusFilesBtn");
const plusWebSearchRow   = document.getElementById("plusWebSearchRow");
const webSearchToggleEl  = document.getElementById("webSearchToggle");
const plusBloomRow       = document.getElementById("plusBloomRow");
const bloomToggleEl      = document.getElementById("bloomToggle");
const cameraInput        = document.getElementById("cameraInput");
const photosInput        = document.getElementById("photosInput");

// File Upload
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

// Bloom Mode state — mirrors bloom.html's generator options
let bloomMode  = false;
let bloomState = { ratio: "1024x1024", model: "flux" };

// Web Search state — toggled from + sheet, sent to /api/ask
let webSearchOn = false;

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

// ------------------------------------------
// 5b. Plus Menu (Add to chat) — Claude-style bottom sheet
//     Replaces the old single paperclip attach button. Camera/Photos
//     pick images with intent already known (→ photo/vision mode),
//     Files picks documents (→ OCR/text mode). No more ambiguity about
//     which mode an attached image should use.
// ------------------------------------------
function openPlusSheet() {
    plusSheet.classList.add("show");
    plusSheetBackdrop.classList.add("show");
    plusBtn.classList.add("open");
}

function closePlusSheet() {
    plusSheet.classList.remove("show");
    plusSheetBackdrop.classList.remove("show");
    plusBtn.classList.remove("open");
}

plusBtn.addEventListener("click", e => {
    e.stopPropagation();
    plusSheet.classList.contains("show") ? closePlusSheet() : openPlusSheet();
});

plusSheetClose.addEventListener("click", closePlusSheet);
plusSheetBackdrop.addEventListener("click", closePlusSheet);
plusSheet.addEventListener("click", e => e.stopPropagation());

// ── Camera → capture a photo → always Photo/Vision mode ──
plusCameraBtn.addEventListener("click", () => {
    closePlusSheet();
    cameraInput.click();
});

cameraInput.addEventListener("change", e => {
    const files = Array.from(e.target.files || []);
    if (files.length) addFilesWithMode(files, "photo");
    cameraInput.value = "";
});

// ── Photos → pick from gallery → always Photo/Vision mode ──
//    (Gallery images are usually real photos/screenshots the user wants
//    *described*, not scanned documents — Photo mode is the safer default
//    here, unlike the generic Files picker.)
plusPhotosBtn.addEventListener("click", () => {
    closePlusSheet();
    photosInput.click();
});

photosInput.addEventListener("change", e => {
    const files = Array.from(e.target.files || []);
    if (files.length) addFilesWithMode(files, "photo");
    photosInput.value = "";
});

// ── Files → documents, PDFs, code, or images treated as scans → Document/OCR mode ──
plusFilesBtn.addEventListener("click", () => {
    closePlusSheet();
    fileInput.click();
});

// ── Web Search toggle ──
plusWebSearchRow.addEventListener("click", () => {
    webSearchOn = !webSearchOn;
    webSearchToggleEl.classList.toggle("on", webSearchOn);
    showToast(webSearchOn ? "🌐 Web search on — replies will use live results" : "Web search off");
});

// ── Bloom toggle (moved here from the header) ──
plusBloomRow.addEventListener("click", () => {
    bloomMode = !bloomMode;
    bloomToggleEl.classList.toggle("on", bloomMode);
    bloomOptsRow.style.display = bloomMode ? "flex" : "none";
    inputBox.placeholder = bloomMode
        ? "Describe an image to generate... (attach a photo to describe it instead)"
        : (selectedFiles.length ? "Ask a question about these files (optional)..." : "Message Shanu AI...");
    showToast(bloomMode ? "🎨 Bloom mode on — type to generate, attach to describe" : "Bloom mode off");
});

bloomOptsRow.addEventListener("click", e => {
    const btn = e.target.closest(".bloom-opt-btn");
    if (!btn) return;
    const { type, val } = btn.dataset;
    bloomOptsRow.querySelectorAll(`.bloom-opt-btn[data-type="${type}"]`).forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    bloomState[type] = val;
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
async function addMessage(text, type = "bot", actionMode = "live") {
    hidePlaceholder();
    const div = document.createElement("div");
    div.className = `msg ${type}`;

    if (type === "bot") {

        // ── Step 1: Parse action tags ONCE ──
        //    actionMode: "live" (fresh reply, execute/download normally),
        //    "history" (page-load replay, show cards without re-triggering
        //    downloads/popups), or false (skip parsing entirely).
        let displayText = text;
        let indicator   = null;

        if (actionMode) {
            const parsed = await parseAndExecuteActions(text, actionMode);
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

        // ── Step 5: Action result card — PDF/PPT get View+Download
        //    buttons, Preview gets a Reopen button. These stay clickable
        //    forever (not a one-time toast), because the blob URL / html
        //    is captured in this closure, one per message. ──
        if (indicator) {
            const card = document.createElement("div");
            card.className = "action-result-pill action-result-card";

            if (indicator.type === "pdf" || indicator.type === "ppt") {
                const isPdf = indicator.type === "pdf";
                card.innerHTML = `
                    <i class="fa-solid ${isPdf ? "fa-file-pdf" : "fa-file-powerpoint"}"></i>
                    <span>${isPdf ? "PDF" : "Presentation"} ready — ${indicator.filename}</span>
                    <div class="action-result-btns">
                        <button class="action-result-btn view-btn"><i class="fa-solid fa-eye"></i> View</button>
                        <button class="action-result-btn dl-btn"><i class="fa-solid fa-download"></i> Download</button>
                    </div>`;
                card.querySelector(".view-btn").addEventListener("click", () => {
                    window.open(indicator.blobUrl, "_blank", "noopener");
                });
                card.querySelector(".dl-btn").addEventListener("click", () => {
                    const a = document.createElement("a");
                    a.href = indicator.blobUrl;
                    a.download = indicator.filename;
                    a.click();
                    showToast(`${isPdf ? "📄" : "📊"} ${indicator.filename} downloaded!`);
                });
            } else if (indicator.type === "pdf-history" || indicator.type === "ppt-history") {
                // From a page reload — the original blob URL is gone (blob:
                // URLs die with the tab), so offer a Regenerate button that
                // rebuilds it on demand from the saved tag content, instead
                // of silently losing the PDF/PPT after every refresh.
                const isPdf = indicator.type === "pdf-history";
                card.innerHTML = `
                    <i class="fa-solid ${isPdf ? "fa-file-pdf" : "fa-file-powerpoint"}"></i>
                    <span>${isPdf ? "PDF" : "Presentation"} from earlier — regenerate to view/download</span>
                    <div class="action-result-btns">
                        <button class="action-result-btn regen-btn"><i class="fa-solid fa-rotate"></i> Regenerate</button>
                    </div>`;
                card.querySelector(".regen-btn").addEventListener("click", async function () {
                    this.disabled = true;
                    this.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Working...';
                    const result = isPdf ? generatePDF(indicator.content) : await generatePPT(indicator.content);
                    if (!result) {
                        this.disabled = false;
                        this.innerHTML = '<i class="fa-solid fa-rotate"></i> Regenerate';
                        return;
                    }
                    window.open(result.blobUrl, "_blank", "noopener");
                    this.innerHTML = '<i class="fa-solid fa-check"></i> Ready — reopening...';
                    setTimeout(() => {
                        this.disabled = false;
                        this.innerHTML = '<i class="fa-solid fa-rotate"></i> Regenerate';
                    }, 2000);
                });
            } else if (indicator.type === "preview") {
                card.innerHTML = `
                    <i class="fa-solid fa-eye"></i>
                    <span>Live preview generated</span>
                    <div class="action-result-btns">
                        <button class="action-result-btn view-btn"><i class="fa-solid fa-arrow-up-right-from-square"></i> Reopen</button>
                    </div>`;
                card.querySelector(".view-btn").addEventListener("click", () => {
                    showLivePreview(indicator.html);
                });
            }

            chatBox.appendChild(card);
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
        image: "Image",
        pdf:   "PDF — text extracted",
        code:  "Code file — analyzed",
        text:  "Text file — read"
    };

    selectedFiles.forEach(item => {
        const cat  = getFileCategory(item.file.type, item.file.name);
        const wrap = document.createElement("div");
        wrap.className = "msg file-msg user";

        if (cat === "image") {
            const modeLabel = item.imageMode === "photo"
                ? "Image — AI Vision analyzed"
                : "Image — OCR extracted";

            // Show the actual image thumbnail (local blob — instant, no wait)
            const blobUrl = URL.createObjectURL(item.file);
            wrap.innerHTML = `
                <div class="file-msg-card file-msg-image-card">
                    <img src="${blobUrl}" class="file-msg-thumb" alt="${item.file.name}">
                    <div class="file-msg-info">
                        <div class="file-msg-name">${item.file.name}</div>
                        <div class="file-msg-sub">${modeLabel}</div>
                    </div>
                </div>`;

            // Re-host on Cloudinary in the background for permanent history
            // (blob URLs die when the tab closes / page reloads)
            const reader = new FileReader();
            reader.onload = () => {
                uploadToCloudinary(reader.result, "shanu-ai/uploads").then(hostedUrl => {
                    if (hostedUrl) wrap.querySelector(".file-msg-thumb").dataset.cloudinaryUrl = hostedUrl;
                });
            };
            reader.readAsDataURL(item.file);

        } else {
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
        }
        chatBox.appendChild(wrap);
    });
    scrollToBottom();
}

// ------------------------------------------
// 10. ✨ ACTION ENGINE — Tag Parser
//     Tags: [PDF] [PPT] [CHART] [PREVIEW] [IMAGE]
//     Returns structured indicator data (not raw HTML) so addMessage()
//     can build a re-openable card — View/Download stay clickable even
//     after the message has scrolled past, instead of a one-time toast.
//
//     mode: "live"    — a fresh AI response just arrived. Execute tags
//                        normally (generate PDF/PPT blob, auto-open the
//                        live preview modal once).
//           "history" — replaying old messages on page load/reload.
//                        Do NOT re-generate blobs or auto-open the
//                        preview modal (that would re-trigger a
//                        "download"/popup for every old message on every
//                        refresh). Instead show a card the user can tap
//                        to regenerate/reopen on demand.
// ------------------------------------------
async function parseAndExecuteActions(rawText, mode = "live") {
    let text      = rawText;
    let indicator = null; // { type: "pdf"|"ppt"|"preview", ...data }

    // [PDF]...[/PDF]
    const pdfMatch = text.match(/\[PDF\]([\s\S]*?)\[\/PDF\]/i);
    if (pdfMatch) {
        text = text.replace(pdfMatch[0], "").trim();
        const content = pdfMatch[1].trim();
        if (mode === "live") {
            const result = generatePDF(content);
            if (result) indicator = { type: "pdf", ...result };
        } else {
            // History replay — don't generate a blob now, just offer a
            // regenerate button with the original content preserved.
            indicator = { type: "pdf-history", content };
        }
    }

    // [PPT]json[/PPT]
    const pptMatch = text.match(/\[PPT\]([\s\S]*?)\[\/PPT\]/i);
    if (pptMatch) {
        text = text.replace(pptMatch[0], "").trim();
        const content = pptMatch[1].trim();
        if (mode === "live") {
            const result = await generatePPT(content);
            if (result) indicator = { type: "ppt", ...result };
        } else {
            indicator = { type: "ppt-history", content };
        }
    }

    // [CHART]json[/CHART]
    const chartMatch = text.match(/\[CHART\]([\s\S]*?)\[\/CHART\]/i);
    if (chartMatch) {
        text = text.replace(chartMatch[0], "").trim();
        // Safe to render in both modes — chart is a pure inline display,
        // no download/popup side effect.
        setTimeout(() => generateChart(chartMatch[1].trim()), 120);
    }

    // [PREVIEW]html[/PREVIEW]
    const previewMatch = text.match(/\[PREVIEW\]([\s\S]*?)\[\/PREVIEW\]/i);
    if (previewMatch) {
        text = text.replace(previewMatch[0], "").trim();
        const html = previewMatch[1].trim();
        if (mode === "live") {
            lastPreviewHTML = html;
            setTimeout(() => showLivePreview(html), 150);
        }
        // Both modes get a Reopen card — history mode just doesn't
        // auto-pop the modal open on load.
        indicator = { type: "preview", html };
    }

    // [IMAGE]prompt[/IMAGE]
    const imageMatch = text.match(/\[IMAGE\]([\s\S]*?)\[\/IMAGE\]/i);
    if (imageMatch) {
        text = text.replace(imageMatch[0], "").trim();
        // Safe in both modes — same as chart, pure inline display.
        setTimeout(() => generateImage(imageMatch[1].trim()), 120);
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
        if (!jsPDF) { showToast("⚠️ jsPDF not loaded yet. Try again."); return null; }

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

        // ── No auto-download. Return a blob URL so the chat can show a
        //    View/Download card that the user controls, and can re-open
        //    later — instead of a surprise download the user didn't ask for. ──
        const blobUrl = doc.output("bloburl").toString();
        return { blobUrl, filename: "shanu-ai-output.pdf" };
    } catch (e) {
        console.error("PDF Error:", e);
        showToast("⚠️ PDF generation failed.");
        return null;
    }
}

// ------------------------------------------
// 12. PPT Generator — PptxGenJS
// ------------------------------------------
async function generatePPT(jsonStr) {
    try {
        if (typeof PptxGenJS === "undefined") {
            showToast("⚠️ PptxGenJS not loaded yet. Try again."); return null;
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

        // ── No auto-download. Get a blob and make our own URL so the
        //    chat can show a Download card the user controls & can
        //    return to later. ──
        const blob    = await pptx.write("blob");
        const blobUrl = URL.createObjectURL(blob);
        return { blobUrl, filename: "shanu-ai-presentation.pptx" };
    } catch (e) {
        console.error("PPT Error:", e);
        showToast("⚠️ PPT failed. Try saying 'retry PPT'.");
        return null;
    }
}

// ------------------------------------------
// 12.4 Cloudinary Helper — used for both user uploads & AI-generated images
// ------------------------------------------
async function uploadToCloudinary(source, folder = "shanu-ai") {
    try {
        const res = await fetch("/api/upload", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ source, folder })
        });
        const data = await res.json();
        if (!res.ok || !data.url) {
            console.warn("Cloudinary upload skipped:", data.error || "unknown error");
            return null;
        }
        return data.url;
    } catch (e) {
        console.warn("Cloudinary upload failed (non-blocking):", e.message);
        return null;
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
        // Re-host on Cloudinary in the background so this image survives
        // permanently (Pollinations URLs can go stale/rate-limited later)
        uploadToCloudinary(url, "shanu-ai/generated").then(hostedUrl => {
            if (hostedUrl) img.dataset.cloudinaryUrl = hostedUrl;
        });
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
        a.href = img.dataset.cloudinaryUrl || url;
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

        // ── Image files get a Document/Photo mode toggle ──
        //    Document → OCR (Tesseract) reads text out of screenshots/scans
        //    Photo    → Gemini Vision "looks" at objects/scenes
        //    User decides explicitly — no guessing, no false negatives.
        const imageToggle = cat === "image" ? `
            <div class="file-chip-mode-toggle" data-idx="${idx}">
                <button type="button" class="chip-mode-btn ${item.imageMode === "document" ? "active" : ""}" data-mode="document">
                    <i class="fa-solid fa-file-lines"></i> Doc
                </button>
                <button type="button" class="chip-mode-btn ${item.imageMode === "photo" ? "active" : ""}" data-mode="photo">
                    <i class="fa-solid fa-image"></i> Photo
                </button>
            </div>` : "";

        chip.innerHTML = `
            <div class="file-chip-icon ${CHIP_CLASS[cat] || "txt"}">
                <i class="fa-solid ${CHIP_ICON[cat] || "fa-file"}"></i>
            </div>
            <div class="file-chip-info">
                <span class="file-chip-name">${item.file.name}</span>
                <span class="file-chip-status" id="chipSt_${idx}">${CHIP_LABEL[cat]}</span>
                ${imageToggle}
            </div>
            <button class="file-chip-remove" data-idx="${idx}" title="Remove">
                <i class="fa-solid fa-xmark"></i>
            </button>`;
        multiFileList.appendChild(chip);
    });

    // Wire up mode toggle clicks
    multiFileList.querySelectorAll(".chip-mode-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const idx  = parseInt(btn.closest(".file-chip-mode-toggle").dataset.idx);
            const mode = btn.dataset.mode;
            if (selectedFiles[idx]) {
                selectedFiles[idx].imageMode = mode;
                renderFileChips();
            }
        });
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
    inputBox.placeholder = bloomMode
        ? "Describe an image to generate... (attach a photo to describe it instead)"
        : "Message Shanu AI...";
}

// ------------------------------------------
// 17. File Input Handler
// ------------------------------------------

// ── Shared helper: add files to selectedFiles with a given default
//    imageMode. Called by Camera (photo), Photos (photo), and Files
//    (document) — each entry point already knows the right intent,
//    so no more forgetting to flip the Doc/Photo toggle after attaching. ──
function addFilesWithMode(files, defaultImageMode = "document") {
    const big = files.filter(f => f.size > 10 * 1024 * 1024);
    if (big.length) { showToast(`⚠️ Too large (max 10MB): ${big.map(f => f.name).join(", ")}`); return; }

    const existing = new Set(selectedFiles.map(i => i.file.name));
    const added    = files.filter(f => !existing.has(f.name));
    added.forEach(f => selectedFiles.push({
        file: f,
        status: "",
        imageMode: defaultImageMode // user can still switch via the chip toggle if needed
    }));

    if (added.length) {
        renderFileChips();
        showToast(`📎 ${added.length} file${added.length > 1 ? "s" : ""} attached`);
        if (!bloomMode) inputBox.placeholder = "Ask a question about these files (optional)...";
        inputBox.focus();
    } else {
        showToast("ℹ️ Files already attached.");
    }
}

fileInput.addEventListener("change", e => {
    const files = Array.from(e.target.files || []);
    addFilesWithMode(files, "document"); // Files picker → default Document/OCR mode
    fileInput.value = "";
});

// ------------------------------------------
// 18. Send Router
// ------------------------------------------
async function handleSendAction() {
    if (sending) return;

    // Bloom mode: image generation (no attachment) or description (attachment present)
    if (bloomMode) {
        if (selectedFiles.length) { await processBloomDescribe(); return; }
        const prompt = inputBox.value.trim();
        if (!prompt) return;
        await sendBloomGenerate(prompt);
        return;
    }

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
            body:    JSON.stringify({ messages: chatContext.slice(-12), mood: currentMood, webSearch: webSearchOn })
        });
        const data = await res.json();
        typingEl.remove();
        const reply = data.reply || "Hmm... kuch samajh nahi aaya 🤔";
        await addMessage(reply, "bot", true);
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
        const { file, imageMode } = selectedFiles[i];
        const cat = getFileCategory(file.type, file.name);
        const ext = getFileExtension(file.name);

        setChipStatus(i, "Processing...", "processing");
        updateProgress(Math.round((i / total) * 85));

        let text = "";
        try {
            if (cat === "image") {
                if (imageMode === "photo") {
                    // ── Photo/Object mode → Gemini Vision ──
                    //    User explicitly said this is a real photo, not a
                    //    document — send it to a vision model that can
                    //    actually see what's in it.
                    setChipStatus(i, "AI looking at image...", "processing");
                    text = await describeImageWithGemini(file);
                } else {
                    // ── Document mode (default) → OCR ──
                    setChipStatus(i, "Running OCR...", "processing");
                    text = await extractTextFromImage(file, i, total);
                }
            }
            else if (cat === "pdf")   { setChipStatus(i, "Extracting PDF...", "processing"); text = await extractTextFromPDF(file); }
            else                      { setChipStatus(i, "Reading file...",   "processing"); text = await readTextFile(file); }
            setChipStatus(i, "✅ Done", "done");
        } catch (err) {
            console.error(`Error on ${file.name}:`, err);
            setChipStatus(i, "❌ Failed", "error");
            // Surface the real reason in the text sent to the AI too —
            // so instead of a confusing "I can't see images" reply, the
            // user sees exactly why it failed (e.g. rate limit).
            text = `[Could not analyze image — ${err.message || "unknown error"}]`;
            if (cat === "image" && imageMode === "photo") {
                showToast(`⚠️ AI Vision failed: ${err.message || "try again in a few seconds"}`);
            }
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
// 19b. Bloom — inline image generation (Pollinations, same as bloom.html)
// ------------------------------------------
function buildBloomImageUrl(prompt, ratio, model, seed) {
    const [w, h] = ratio.split("x");
    const params = new URLSearchParams({
        width: w, height: h, model, seed,
        nologo: "true",
        referrer: "shanu-ai-bloom"
    });
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

async function sendBloomGenerate(prompt) {
    addMessage(prompt, "user");
    inputBox.value = ""; resizeInput();
    hidePlaceholder();

    const ratio = bloomState.ratio;
    const model = bloomState.model;
    const seed  = Math.floor(Math.random() * 1000000);
    const wrapClass = ratio === "1024x576" ? "wide" : (ratio === "768x1024" ? "tall" : "");

    const row = document.createElement("div");
    row.className = "msg bot";
    row.innerHTML = `
        <div class="bloom-img-card">
            <div class="bloom-img-wrap ${wrapClass}">
                <div class="bloom-img-loader">
                    <div class="bloom-spin"></div>
                    <span>Generating with ${model}...</span>
                </div>
                <img alt="${prompt.replace(/"/g, "")}">
            </div>
            <div class="bloom-img-actions" style="display:none;">
                <button class="bloom-regen-btn">↻ Regenerate</button>
                <button class="bloom-download-btn">⇩ Save</button>
            </div>
        </div>
    `;
    chatBox.appendChild(row);
    scrollToBottom();

    loadBloomImage(row, prompt, ratio, model, seed);

    // Save a lightweight record in chat history/context (image itself isn't sent to the text AI)
    chatContext.push({ role: "user", content: `[Bloom image request: "${prompt}"]` });
    await saveMessageToDB("user", `🎨 Generated image: "${prompt}"`);
}

function loadBloomImage(row, prompt, ratio, model, seed) {
    const wrap    = row.querySelector(".bloom-img-wrap");
    const loader  = wrap.querySelector(".bloom-img-loader");
    const img     = wrap.querySelector("img");
    const actions = row.querySelector(".bloom-img-actions");
    const url     = buildBloomImageUrl(prompt, ratio, model, seed);

    img.classList.remove("loaded");
    loader.style.display = "flex";
    actions.style.display = "none";
    const oldErr = wrap.querySelector(".bloom-img-err");
    if (oldErr) oldErr.remove();
    img.style.display = "block";

    img.onload = () => {
        loader.style.display = "none";
        img.classList.add("loaded");
        actions.style.display = "flex";
        scrollToBottom();
    };
    img.onerror = () => {
        loader.style.display = "none";
        img.style.display = "none";
        const err = document.createElement("div");
        err.className = "bloom-img-err";
        err.innerHTML = `<span>⚠ Couldn't generate that image.</span><button>Try again</button>`;
        err.querySelector("button").addEventListener("click", () => {
            loadBloomImage(row, prompt, ratio, model, Math.floor(Math.random() * 1000000));
        });
        wrap.appendChild(err);
    };
    img.src = url;

    row.querySelector(".bloom-regen-btn")?.addEventListener("click", () => {
        loadBloomImage(row, prompt, ratio, model, Math.floor(Math.random() * 1000000));
    }, { once: true });

    row.querySelector(".bloom-download-btn")?.addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = url;
        a.download = `bloom-${seed}.jpg`;
        a.target = "_blank";
        a.rel = "noopener";
        a.click();
    }, { once: true });
}

// ------------------------------------------
// 19c. Bloom — image description (reuses the existing /api/vision proxy,
//      same describeImageWithGemini() used by the normal "photo mode" flow)
// ------------------------------------------
async function processBloomDescribe() {
    const question = inputBox.value.trim();
    inputBox.value = ""; resizeInput();

    const { file } = selectedFiles[0]; // Bloom describe handles one image at a time
    addFileBubbles();
    lockUI();
    hidePlaceholder();

    const typingEl = showTyping();
    let description;
    try {
        description = await describeImageWithGemini(file);
    } catch (err) {
        typingEl.remove();
        addMessage(`❌ Couldn't describe that image — ${err.message || "unknown error"}`, "bot", false);
        clearAllFiles();
        unlockUI();
        return;
    }
    typingEl.remove();
    await addMessage(description, "bot", true);

    chatContext.push({ role: "user", content: `[Bloom image attached]${question ? " Question: " + question : ""}` });
    chatContext.push({ role: "assistant", content: description });
    await saveMessageToDB("user", `🖼️ Described image: ${file.name}`);
    await saveMessageToDB("assistant", description);

    clearAllFiles();
    unlockUI();
}

// ── Gemini Vision — describes photos/objects (Google AI Studio key) ──
//    Routed through /api/vision (our own backend) so the Google API key
//    never touches the browser — same pattern as /api/ask.js uses for
//    the OpenRouter key. Image GENERATION is untouched and still runs
//    on Pollinations (see loadPollinationsImage above).
async function describeImageWithGemini(file) {
    const base64 = await fileToResizedBase64(file, 1024, 0.82);

    const res = await fetch("/api/vision", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ imageBase64: base64 })
    });

    let data;
    try {
        data = await res.json();
    } catch {
        throw new Error(`Vision backend returned invalid response (${res.status})`);
    }

    if (!res.ok) {
        throw new Error(data?.error || `Vision request failed (${res.status})`);
    }

    const description = data?.description?.trim();
    if (!description) {
        throw new Error("Vision backend returned empty description");
    }

    // ── Reject non-answers that still come back as 200 OK ──
    //    Some models occasionally refuse or claim they can't see images
    //    even when handed one correctly. Surface that clearly instead of
    //    quietly passing a useless "I can't see images" reply to the AI.
    const looksLikeRefusal =
        /\b(cannot|can't|unable to)\s+(see|view|access|analyze|process)\b/i.test(description) ||
        /\bi don'?t have (the )?(ability|permission|capability)\b/i.test(description);

    if (looksLikeRefusal) {
        throw new Error(`Vision model refused/couldn't see the image. It said: "${description.slice(0, 150)}"`);
    }

    return description;
}

// ── Resize + compress an image File to a base64 data URL ──
//    Keeps vision payloads small (phone photos can be 5-10MB raw).
function fileToResizedBase64(file, maxDim = 1024, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            let w = img.naturalWidth, h = img.naturalHeight;
            if (w > maxDim || h > maxDim) {
                const scale = maxDim / Math.max(w, h);
                w = Math.floor(w * scale);
                h = Math.floor(h * scale);
            }
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(objectUrl);
            resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Failed to load image for vision analysis"));
        };
        img.src = objectUrl;
    });
}

// ------------------------------------------
// 21. preprocessImage + extractTextFromImage — OCR pipeline (Document mode)
//     File → ObjectURL → Canvas → Grayscale+Contrast boost → Tesseract
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
    // ── Step 1: Instant render from localStorage (no network wait) ──
    const localHistory = loadLocalHistorySync();
    let renderedCount = 0;
    if (localHistory.length > 0) {
        if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
        localHistory.forEach(m => {
            addMessage(m.content, m.role === "user" ? "user" : "bot", "history");
            chatContext.push({ role: m.role, content: m.content });
        });
        renderedCount = localHistory.length;
    }

    // ── Step 2: Confirm/reconcile with Firestore in the background ──
    //    If Firestore has MORE messages than local (e.g. different device,
    //    or local cache was cleared), re-render the full authoritative set.
    try {
        await initAuth();      // Trigger anonymous sign-in
        await waitForAuth();   // Block until auth state settles
        const history = await loadHistoryFromDB(30);

        if (history.length > renderedCount) {
            chatBox.innerHTML = "";
            chatContext.length = 0;
            if (history.length > 0 && emptyPlaceholder) emptyPlaceholder.style.display = "none";
            history.forEach(m => {
                addMessage(m.content, m.role === "user" ? "user" : "bot", "history");
                chatContext.push({ role: m.role, content: m.content });
            });
        }
    } catch (err) {
        console.error("Init error (localStorage history already shown):", err);
    }
}

document.addEventListener("DOMContentLoaded", initChat);
