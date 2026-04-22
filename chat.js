// ==========================================
// Shanu AI — Chat Logic v2
// Developer: Shiva Saini
// Upgrades: File Upload (OCR / PDF / TXT), Mic (Web Speech API),
//           Enhanced UI, Toast Notifications, Mobile Sidebar
// ==========================================

import { saveMessageToDB, loadHistoryFromDB, clearSessionDB } from './firebase.js';

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
const fileChip         = document.getElementById("fileChip");
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
let currentMood   = "normal";
let sending       = false;
let chatContext   = [];
let selectedFile  = null;   // Currently attached file object
let isRecording   = false;
let recognition   = null;   // SpeechRecognition instance
let toastTimer    = null;

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
function showToast(msg, duration = 3000) {
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
    const existing = Array.from(recentMoods.children);
    if (existing.some(el => el.dataset.value === moodObj.value)) return;

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
// 6. Input Resize & Keyboard
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

function addMessage(text, type = "bot") {
    hidePlaceholder();
    const div = document.createElement("div");
    div.className = `msg ${type}`;
    div.textContent = text;
    chatBox.appendChild(div);
    scrollToBottom();
    return div;
}

function addFileMessageBubble(file) {
    hidePlaceholder();
    const type = getFileCategory(file.type);
    const iconMap = { image: "fa-image", pdf: "fa-file-pdf", text: "fa-file-lines" };
    const labelMap = { image: "Image scanned via OCR", pdf: "PDF text extracted", text: "Text file read" };

    const wrap = document.createElement("div");
    wrap.className = "msg file-msg user";
    wrap.innerHTML = `
        <div class="file-msg-card">
            <div class="file-msg-icon ${type}">
                <i class="fa-solid ${iconMap[type] || 'fa-file'}"></i>
            </div>
            <div class="file-msg-info">
                <div class="file-msg-name">${file.name}</div>
                <div class="file-msg-sub">${labelMap[type] || 'File attached'}</div>
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
// 8. Core Send Logic
// ------------------------------------------
async function handleSendAction() {
    if (sending) return;

    // If a file is attached, process it first
    if (selectedFile) {
        await procesAndSendFile(selectedFile);
        return;
    }

    // Plain text send
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
    await callAPI(text);
}

async function callAPI(userMsgForContext) {
    lockUI();
    const typingEl = showTyping();

    try {
        const res = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: chatContext.slice(-10),
                mood: currentMood
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
// 9. File Upload & OCR System
// ------------------------------------------
function getFileCategory(mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/pdf") return "pdf";
    return "text";
}

function getFileIcon(mimeType) {
    const cat = getFileCategory(mimeType);
    return { image: "fa-file-image", pdf: "fa-file-pdf", text: "fa-file-lines" }[cat];
}

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Size check — 10 MB max
    if (file.size > 10 * 1024 * 1024) {
        showToast("⚠️ File too large. Max 10 MB.");
        fileInput.value = "";
        return;
    }

    selectedFile = file;
    const cat = getFileCategory(file.type);

    // Update chip
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

async function procesAndSendFile(file) {
    const cat = getFileCategory(file.type);
    const userTypedText = inputBox.value.trim();

    // Show file bubble in chat
    addFileMessageBubble(file);

    inputBox.value = "";
    resizeInput();

    // Update chip status
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

    // Build context message
    let contextMsg = `[📎 File: ${file.name}]\n`;

    if (extractedText.trim().length > 0) {
        // Limit to 3000 chars to avoid token overflow
        const trimmed = extractedText.trim().slice(0, 3000);
        contextMsg += `\nExtracted Content:\n"""\n${trimmed}\n"""`;
    } else {
        contextMsg += "\n[No readable text found in this file]";
        showToast("⚠️ No text could be extracted from this file.");
    }

    if (userTypedText) {
        contextMsg += `\n\nUser says: ${userTypedText}`;
    }

    // Save & send
    chatContext.push({ role: "user", content: contextMsg });
    await saveMessageToDB("user", contextMsg);

    clearFileAttachment();
    await callAPI(contextMsg);
}

// ---- Image OCR using Tesseract.js ----
async function extractTextFromImage(file) {
    fileChipStatus.textContent = "Running OCR scan...";

    return new Promise((resolve, reject) => {
        Tesseract.recognize(file, "eng+hin", {
            logger: (m) => {
                if (m.status === "recognizing text") {
                    const progress = 15 + Math.round(m.progress * 75);
                    updateOcrProgress(progress);
                    fileChipStatus.textContent = `Scanning... ${Math.round(m.progress * 100)}%`;
                }
            }
        }).then(({ data: { text } }) => {
            resolve(text);
        }).catch(reject);
    });
}

// ---- PDF Text Extraction using PDF.js ----
async function extractTextFromPDF(file) {
    fileChipStatus.textContent = "Reading PDF...";
    updateOcrProgress(20);

    const arrayBuffer = await file.arrayBuffer();
    const typedArray = new Uint8Array(arrayBuffer);

    // Set PDF.js worker
    const pdfjsLib = window["pdfjs-dist/build/pdf"];
    if (!pdfjsLib) throw new Error("PDF.js not loaded");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
    let fullText = "";
    const totalPages = pdf.numPages;

    for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += `\n--- Page ${i} ---\n${pageText}`;

        const progress = 20 + Math.round((i / totalPages) * 75);
        updateOcrProgress(progress);
        fileChipStatus.textContent = `Reading page ${i} of ${totalPages}...`;
    }

    return fullText;
}

// ---- Plain Text File ----
async function readTextFile(file) {
    fileChipStatus.textContent = "Reading file...";
    updateOcrProgress(60);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result || "");
        reader.onerror = reject;
        reader.readAsText(file, "UTF-8");
    });
}

// ------------------------------------------
// 10. Microphone — Web Speech API
// ------------------------------------------
function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        showToast("⚠️ Voice input not supported in this browser. Use Chrome.");
        return false;
    }

    recognition = new SR();
    recognition.lang = "hi-IN"; // Hinglish — Hindi + English fallback
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add("recording");
        micIcon.className = "fa-solid fa-stop";
        inputBox.placeholder = "Listening...";
        showToast("🎙️ Listening...");
    };

    recognition.onresult = (e) => {
        const transcript = Array.from(e.results)
            .map(r => r[0].transcript)
            .join("");
        inputBox.value = transcript;
        resizeInput();
    };

    recognition.onend = () => {
        isRecording = false;
        micBtn.classList.remove("recording");
        micIcon.className = "fa-solid fa-microphone";
        inputBox.placeholder = selectedFile ? "Add a message (optional)..." : "Message Shanu AI...";

        // Auto-send if text was captured
        const t = inputBox.value.trim();
        if (t) {
            setTimeout(() => handleSendAction(), 300);
        }
    };

    recognition.onerror = (e) => {
        console.error("Speech error:", e.error);
        isRecording = false;
        micBtn.classList.remove("recording");
        micIcon.className = "fa-solid fa-microphone";
        const msgs = {
            "no-speech": "No speech detected. Try again.",
            "not-allowed": "Microphone permission denied.",
            "network": "Network error during voice input."
        };
        showToast(`⚠️ ${msgs[e.error] || "Voice input error."}`);
    };

    return true;
}

micBtn.addEventListener("click", () => {
    if (isRecording) {
        recognition?.stop();
        return;
    }

    if (!recognition) {
        const ok = initSpeechRecognition();
        if (!ok) return;
    }

    try {
        recognition.start();
    } catch (e) {
        // Already started — stop and restart
        recognition.stop();
        setTimeout(() => recognition.start(), 300);
    }
});

// ------------------------------------------
// 11. Send Button
// ------------------------------------------
sendBtn.addEventListener("click", handleSendAction);

// ------------------------------------------
// 12. Clear & New Chat
// ------------------------------------------
clearBtn.addEventListener("click", async () => {
    if (!confirm("Bhai, saari chat delete kar doon? 🗑️")) return;
    await clearSessionDB();
    chatBox.innerHTML = "";
    if (emptyPlaceholder) {
        chatBox.appendChild(emptyPlaceholder);
        emptyPlaceholder.style.display = "flex";
    }
    chatContext = [];
    clearFileAttachment();
    showToast("Chat cleared ✓");
});

newChatBtn.addEventListener("click", () => {
    inputBox.focus();
    // Close mobile sidebar
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
});

// ------------------------------------------
// 13. Init — Load history from Firebase
// ------------------------------------------
async function initChat() {
    try {
        const history = await loadHistoryFromDB(20);
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

document.addEventListener("DOMContentLoaded", initChat);
