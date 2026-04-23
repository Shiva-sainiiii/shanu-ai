// ==========================================
// Shanu AI — Chat Logic v3
// Developer: Shiva Saini
// Fixes: Auth race condition, Image OCR pipeline
// Features: Markdown, Syntax Highlight, Copy Code/Response, PDF Export
// ==========================================

import { saveMessageToDB, loadHistoryFromDB, clearSessionDB, initAuth, waitForAuth } from './firebase.js';

// ------------------------------------------
// 1. DOM Elements
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
const fileChipName     = document.getElementById("fileChipName");
const fileChipStatus   = document.getElementById("fileChipStatus");
const fileChipIcon     = document.getElementById("fileChipIcon");
const removeFileBtn    = document.getElementById("removeFileBtn");
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

// ------------------------------------------
// 2. State
// ------------------------------------------
let currentMood  = "normal";
let sending      = false;
let chatContext  = [];
let selectedFile = null;
let isRecording  = false;
let recognition  = null;
let toastTimer   = null;

// ------------------------------------------
// 3. Configure marked.js (safe rendering)
// ------------------------------------------
if (window.marked) {
    marked.setOptions({
        breaks:   true,      // Line breaks → <br>
        gfm:      true,      // GitHub Flavored Markdown
        headerIds: false,    // No auto IDs (security)
        mangle:   false
    });
}

// ------------------------------------------
// 4. Mood Definitions
// ------------------------------------------
const MOODS = [
    { value: "normal",     label: "😌 Normal"    },
    { value: "flirty",     label: "😉 Flirty"    },
    { value: "girlfriend", label: "❤️ Girlfriend" },
    { value: "boyfriend",  label: "🛡️ Boyfriend"  },
    { value: "rude",       label: "😏 Sarcastic"  },
    { value: "baby",       label: "👶 Baby"       },
    { value: "roast",      label: "🔥 Roast"      },
    { value: "coach",      label: "💪 Coach"      },
];

// ------------------------------------------
// 5. Toast Notification
// ------------------------------------------
function showToast(msg, duration = 3000) {
    toastMsg.textContent = msg;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

// ------------------------------------------
// 6. Mood Dropdown
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
// 7. Mobile Sidebar
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
// 8. Input Resize & Keyboard
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
// 9. PDF Generation
// ------------------------------------------
function generatePDF(text) {
    try {
        if (!window.jspdf) {
            showToast("⚠️ PDF library not loaded yet. Try again.");
            return;
        }
        const { jsPDF } = window.jspdf;
        const pdfDoc = new jsPDF({ unit: "mm", format: "a4" });

        // Strip markdown symbols for clean PDF output
        const clean = text
            .replace(/#{1,6}\s/g, "")
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/\*(.+?)\*/g, "$1")
            .replace(/`{1,3}[^`]*`{1,3}/g, "")
            .replace(/\[(.+?)\]\(.+?\)/g, "$1")
            .trim();

        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.setFontSize(11);
        pdfDoc.setTextColor(30, 30, 30);

        // Header
        pdfDoc.setFontSize(14);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("Shanu AI — Response Export", 10, 15);
        pdfDoc.setFontSize(9);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.setTextColor(120, 120, 120);
        pdfDoc.text(`Generated: ${new Date().toLocaleString()}`, 10, 22);

        // Body
        pdfDoc.setTextColor(30, 30, 30);
        pdfDoc.setFontSize(11);
        const lines = pdfDoc.splitTextToSize(clean, 185);
        pdfDoc.text(lines, 10, 32);

        pdfDoc.save("shanu-ai-response.pdf");
        showToast("📄 PDF downloaded successfully!");
    } catch (e) {
        console.error("PDF generation error:", e);
        showToast("❌ PDF generation failed");
    }
}

// ------------------------------------------
// 10. Chat UI Helpers
// ------------------------------------------
function scrollToBottom() {
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
}

function hidePlaceholder() {
    if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
}

/**
 * Render a message bubble.
 * Bot messages: parsed markdown + code highlighting + action bar.
 * User messages: plain text.
 */
function addMessage(text, type = "bot") {
    hidePlaceholder();
    const div = document.createElement("div");
    div.className = `msg ${type}`;

    if (type === "bot") {
        // ── Markdown rendering ──
        if (window.marked) {
            div.innerHTML = marked.parse(text);
        } else {
            div.textContent = text;
        }

        // ── Syntax highlighting + Copy Code buttons ──
        div.querySelectorAll("pre code").forEach(block => {
            if (window.hljs) {
                hljs.highlightElement(block);
            }

            const pre = block.parentElement;
            pre.classList.add("code-block-wrap");

            // Detect language label
            const lang = block.className.replace("language-", "").replace("hljs", "").trim() || "code";

            const header = document.createElement("div");
            header.className = "code-block-header";
            header.innerHTML = `
                <span class="code-lang-label">${lang}</span>
                <button class="copy-code-btn">
                    <i class="fa-solid fa-copy"></i> Copy
                </button>
            `;
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

        // ── Response Actions Bar ──
        const actionBar = document.createElement("div");
        actionBar.className = "msg-actions";
        actionBar.innerHTML = `
            <button class="msg-action-btn copy-resp-btn" title="Copy response">
                <i class="fa-solid fa-copy"></i> Copy
            </button>
        `;

        actionBar.querySelector(".copy-resp-btn").addEventListener("click", function () {
            navigator.clipboard.writeText(text).then(() => {
                this.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                showToast("✅ Response copied to clipboard");
                setTimeout(() => {
                    this.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
                }, 2000);
            });
        });

        div.appendChild(actionBar);

        // ── Auto PDF generation trigger ──
        if (text.toLowerCase().includes("generate pdf")) {
            setTimeout(() => generatePDF(text), 400);
        }

    } else {
        // User messages — plain text only (no XSS risk)
        div.textContent = text;
    }

    chatBox.appendChild(div);
    scrollToBottom();
    return div;
}

function addFileMessageBubble(file) {
    hidePlaceholder();
    const type = getFileCategory(file.type);
    const iconMap  = { image: "fa-image", pdf: "fa-file-pdf", text: "fa-file-lines" };
    const labelMap = { image: "Image scanned via OCR", pdf: "PDF text extracted", text: "Text file read" };

    const wrap = document.createElement("div");
    wrap.className = "msg file-msg user";
    wrap.innerHTML = `
        <div class="file-msg-card">
            <div class="file-msg-icon ${type}">
                <i class="fa-solid ${iconMap[type] || "fa-file"}"></i>
            </div>
            <div class="file-msg-info">
                <div class="file-msg-name">${file.name}</div>
                <div class="file-msg-sub">${labelMap[type] || "File attached"}</div>
            </div>
        </div>
    `;
    chatBox.appendChild(wrap);
    scrollToBottom();
}

function showTyping() {
    hidePlaceholder();
    const wrap = document.createElement("div");
    wrap.className = "typing-indicator";
    wrap.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
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
// 11. Core Send Logic
// ------------------------------------------
async function handleSendAction() {
    if (sending) return;
    if (selectedFile) {
        await processAndSendFile(selectedFile);
        return;
    }
    const text = inputBox.value.trim();
    if (!text) return;
    await sendTextMessage(text);
}

async function sendTextMessage(text) {
    addMessage(text, "user");
    inputBox.value = "";
    resizeInput();
    chatContext.push({ role: "user", content: text });
    await saveMessageToDB("user", text);
    await callAPI();
}

async function callAPI() {
    lockUI();
    const typingEl = showTyping();

    try {
        const res = await fetch("/api/ask", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
                messages: chatContext.slice(-12), // Last 12 for context window balance
                mood:     currentMood
            })
        });

        const data = await res.json();
        typingEl.remove();

        const reply = data.reply || "Hmm... kuch samajh nahi aaya 🤔";
        addMessage(reply, "bot");
        chatContext.push({ role: "assistant", content: reply });
        await saveMessageToDB("assistant", reply);

    } catch (err) {
        console.error("API Error:", err);
        typingEl.remove();
        addMessage("❌ Network error! Please check your connection.", "bot");
    }

    unlockUI();
}

// ------------------------------------------
// 12. File Upload System
// ------------------------------------------
function getFileCategory(mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/pdf") return "pdf";
    return "text";
}

function getFileIcon(mimeType) {
    return { image: "fa-file-image", pdf: "fa-file-pdf", text: "fa-file-lines" }[getFileCategory(mimeType)];
}

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        showToast("⚠️ File too large. Max 10 MB.");
        fileInput.value = "";
        return;
    }

    selectedFile = file;
    const cat = getFileCategory(file.type);

    fileChipName.textContent = file.name;
    fileChipStatus.textContent = "Ready — click Send to process";
    fileChipIcon.className = `file-chip-icon ${cat}`;
    fileChipIcon.innerHTML = `<i class="fa-solid ${getFileIcon(file.type)}"></i>`;
    filePreviewBar.classList.add("show");
    ocrProgressBar.classList.remove("show");
    ocrProgressFill.style.width = "0%";

    showToast(`📎 ${file.name} attached`);
    inputBox.placeholder = "Add a message (optional)...";
    inputBox.focus();
    fileInput.value = "";
});

removeFileBtn.addEventListener("click", clearFileAttachment);

function clearFileAttachment() {
    selectedFile = null;
    filePreviewBar.classList.remove("show");
    ocrProgressBar.classList.remove("show");
    ocrProgressFill.style.width = "0%";
    inputBox.placeholder = "Message Shanu AI...";
}

function updateOcrProgress(percent) {
    ocrProgressBar.classList.add("show");
    ocrProgressFill.style.width = `${Math.min(percent, 100)}%`;
}

async function processAndSendFile(file) {
    const cat = getFileCategory(file.type);
    const userTypedText = inputBox.value.trim();

    addFileMessageBubble(file);
    inputBox.value = "";
    resizeInput();
    fileChipStatus.textContent = "Processing...";
    updateOcrProgress(10);

    let extractedText = "";
    try {
        if (cat === "image") {
            extractedText = await extractTextFromImage(file);
        } else if (cat === "pdf") {
            extractedText = await extractTextFromPDF(file);
        } else {
            extractedText = await readTextFile(file);
        }
    } catch (err) {
        console.error("File processing error:", err);
        addMessage("❌ File process nahi hua. Please try again.", "bot");
        clearFileAttachment();
        return;
    }

    updateOcrProgress(100);

    let contextMsg = `[📎 File: ${file.name}]\n`;
    if (extractedText.trim().length > 0) {
        const trimmed = extractedText.trim().slice(0, 3000);
        contextMsg += `\nExtracted Content:\n"""\n${trimmed}\n"""`;
    } else {
        contextMsg += "\n[No readable text found in this file]";
        showToast("⚠️ No text could be extracted from this file.");
    }

    if (userTypedText) contextMsg += `\n\nUser says: ${userTypedText}`;

    chatContext.push({ role: "user", content: contextMsg });
    await saveMessageToDB("user", contextMsg);
    clearFileAttachment();
    await callAPI();
}

// ------------------------------------------
// 13. Image OCR — Fixed Pipeline
//     Problem: Raw File object passed to Tesseract → fails on some browsers
//     Fix: File → Object URL → Image → Canvas (preprocessed) → Tesseract
// ------------------------------------------

/**
 * Preprocess image for OCR:
 *   1. Load file via Object URL
 *   2. Scale down if > 2000px
 *   3. Draw on canvas
 *   4. Apply grayscale + contrast boost via pixel manipulation
 *   5. Revoke Object URL (memory cleanup)
 * @param {File} file
 * @returns {Promise<HTMLCanvasElement>}
 */
async function preprocessImage(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            // Scale down oversized images to stay within OCR limits
            const MAX_DIM = 2000;
            let w = img.naturalWidth;
            let h = img.naturalHeight;

            if (w > MAX_DIM || h > MAX_DIM) {
                const scale = MAX_DIM / Math.max(w, h);
                w = Math.floor(w * scale);
                h = Math.floor(h * scale);
            }

            const canvas = document.createElement("canvas");
            canvas.width  = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");

            // Draw original image
            ctx.drawImage(img, 0, 0, w, h);

            // Pixel-level grayscale + contrast boost (factor: 1.5)
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;
            const CONTRAST = 1.5;

            for (let i = 0; i < data.length; i += 4) {
                // Luminance-weighted grayscale (ITU-R BT.601)
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                // Apply contrast around midpoint (128)
                const boosted = Math.max(0, Math.min(255, ((gray - 128) * CONTRAST) + 128));
                data[i]     = boosted; // R
                data[i + 1] = boosted; // G
                data[i + 2] = boosted; // B
                // Alpha (data[i+3]) unchanged
            }
            ctx.putImageData(imageData, 0, 0);

            URL.revokeObjectURL(objectUrl); // Free memory
            resolve(canvas);
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Failed to load image for OCR preprocessing"));
        };

        img.src = objectUrl;
    });
}

/**
 * Extract text from an image file using Tesseract.js.
 * Uses preprocessed canvas for best accuracy.
 */
async function extractTextFromImage(file) {
    fileChipStatus.textContent = "Preprocessing image...";
    updateOcrProgress(10);

    // Step 1: Preprocess → canvas
    const canvas = await preprocessImage(file);
    updateOcrProgress(20);

    fileChipStatus.textContent = "Running OCR scan...";

    // Step 2: Pass canvas (not raw file) to Tesseract
    return new Promise((resolve, reject) => {
        Tesseract.recognize(canvas, "eng+hin", {
            logger: m => {
                if (m.status === "recognizing text") {
                    const progress = 20 + Math.round(m.progress * 72);
                    updateOcrProgress(progress);
                    fileChipStatus.textContent = `Scanning... ${Math.round(m.progress * 100)}%`;
                }
            }
        })
        .then(({ data: { text } }) => resolve(text))
        .catch(reject);
    });
}

// ------------------------------------------
// 14. PDF Text Extraction (PDF.js)
// ------------------------------------------
async function extractTextFromPDF(file) {
    fileChipStatus.textContent = "Reading PDF...";
    updateOcrProgress(20);

    const arrayBuffer = await file.arrayBuffer();
    const typedArray  = new Uint8Array(arrayBuffer);

    const pdfjsLib = window["pdfjs-dist/build/pdf"];
    if (!pdfjsLib) throw new Error("PDF.js not loaded");

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const pdf       = await pdfjsLib.getDocument({ data: typedArray }).promise;
    let   fullText  = "";
    const totalPages = pdf.numPages;

    for (let i = 1; i <= totalPages; i++) {
        const page        = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText    = textContent.items.map(item => item.str).join(" ");
        fullText += `\n--- Page ${i} ---\n${pageText}`;

        updateOcrProgress(20 + Math.round((i / totalPages) * 75));
        fileChipStatus.textContent = `Reading page ${i} of ${totalPages}...`;
    }

    return fullText;
}

// ------------------------------------------
// 15. Plain Text File
// ------------------------------------------
async function readTextFile(file) {
    fileChipStatus.textContent = "Reading file...";
    updateOcrProgress(60);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result || "");
        reader.onerror = reject;
        reader.readAsText(file, "UTF-8");
    });
}

// ------------------------------------------
// 16. Microphone — Web Speech API
// ------------------------------------------
function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        showToast("⚠️ Voice input not supported. Use Chrome.");
        return false;
    }

    recognition = new SR();
    recognition.lang            = "hi-IN";
    recognition.interimResults  = true;
    recognition.continuous      = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add("recording");
        micIcon.className = "fa-solid fa-stop";
        inputBox.placeholder = "Listening...";
        showToast("🎙️ Listening...");
    };

    recognition.onresult = e => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
        inputBox.value = transcript;
        resizeInput();
    };

    recognition.onend = () => {
        isRecording = false;
        micBtn.classList.remove("recording");
        micIcon.className = "fa-solid fa-microphone";
        inputBox.placeholder = selectedFile ? "Add a message (optional)..." : "Message Shanu AI...";
        const t = inputBox.value.trim();
        if (t) setTimeout(() => handleSendAction(), 300);
    };

    recognition.onerror = e => {
        console.error("Speech error:", e.error);
        isRecording = false;
        micBtn.classList.remove("recording");
        micIcon.className = "fa-solid fa-microphone";
        const msgs = {
            "no-speech":   "No speech detected. Try again.",
            "not-allowed": "Microphone permission denied.",
            "network":     "Network error during voice input."
        };
        showToast(`⚠️ ${msgs[e.error] || "Voice input error."}`);
    };

    return true;
}

micBtn.addEventListener("click", () => {
    if (isRecording) { recognition?.stop(); return; }
    if (!recognition) {
        const ok = initSpeechRecognition();
        if (!ok) return;
    }
    try {
        recognition.start();
    } catch (e) {
        recognition.stop();
        setTimeout(() => recognition.start(), 300);
    }
});

// ------------------------------------------
// 17. Send Button
// ------------------------------------------
sendBtn.addEventListener("click", handleSendAction);

// ------------------------------------------
// 18. Clear & New Chat
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

// ------------------------------------------
// 19. Init — Auth-Safe Chat Initialization
//
//     FIX: Previously, initChat() was called on DOMContentLoaded
//     without waiting for Firebase auth state to resolve. This caused
//     a race condition where getCurrentUserId() returned a guest ID
//     before the anonymous UID was assigned — loading wrong/empty history.
//
//     SOLUTION:
//       1. initAuth()  — trigger anonymous sign-in
//       2. waitForAuth() — block until onAuthStateChanged resolves
//       3. Only then call loadHistoryFromDB()
// ------------------------------------------
async function initChat() {
    try {
        // Step 1: Trigger anonymous sign-in (non-blocking attempt)
        await initAuth();

        // Step 2: Wait for auth state to FULLY settle before any Firestore read
        await waitForAuth();

        // Step 3: Now safe — load history with correct stable UID
        const history = await loadHistoryFromDB(30);

        if (history.length > 0) {
            if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
            history.forEach(m => {
                const role = m.role === "user" ? "user" : "bot";
                addMessage(m.content, role);
                chatContext.push({ role: m.role, content: m.content });
            });
        }
    } catch (err) {
        console.error("Init error:", err);
    }
}

// Auth-safe entry point
document.addEventListener("DOMContentLoaded", initChat);
