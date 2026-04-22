// ==========================================
// Shanu AI — Chat Logic v3
// Developer: Shiva Saini
// Upgrades: Google Auth, Global Tesseract Worker, Smart 3-Path File Handler,
//           Image Pre-processing (Grayscale + Contrast), Chat Privacy
// ==========================================

import {
    saveMessageToDB,
    loadHistoryFromDB,
    clearSessionDB,
    signInWithGoogle,
    signOutUser,
    onAuthStateChange
} from './firebase.js';

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
const fileChipIcon     = document.getElementById("fileChipIcon");
const fileChipName     = document.getElementById("fileChipName");
const fileChipStatus   = document.getElementById("fileChipStatus");
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

// Auth elements
const loginBtn             = document.getElementById("loginBtn");
const logoutBtn            = document.getElementById("logoutBtn");
const userProfileBadge     = document.getElementById("userProfileBadge");
const userAvatarHeader     = document.getElementById("userAvatarHeader");
const userFirstName        = document.getElementById("userFirstName");
const sidebarUserPanel     = document.getElementById("sidebarUserPanel");
const sidebarUserAvatar    = document.getElementById("sidebarUserAvatar");
const sidebarUserName      = document.getElementById("sidebarUserName");
const sidebarUserEmail     = document.getElementById("sidebarUserEmail");

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
let chatInitDone = false;   // Prevents double-init on rapid auth state fires

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

// ==========================================
// 3. GLOBAL TESSERACT WORKER
// Pre-warmed on page load — eliminates first-use lag.
// Single worker reused for all OCR operations.
// ==========================================
let _workerPromise = null;

function getTesseractWorker() {
    if (!_workerPromise) {
        _workerPromise = Tesseract.createWorker('eng+hin', 1, {
            logger: (m) => {
                // Stream progress into the UI as recognition runs
                if (m.status === 'recognizing text') {
                    const pct = 20 + Math.round(m.progress * 70);
                    updateOcrProgress(pct);
                    fileChipStatus.textContent = `Scanning... ${Math.round(m.progress * 100)}%`;
                }
            }
        }).catch(err => {
            // Reset so next call retries
            _workerPromise = null;
            console.error("Tesseract worker init failed:", err);
            throw err;
        });
    }
    return _workerPromise;
}

// Pre-warm the worker as soon as the script loads
// (runs in background — non-blocking)
getTesseractWorker().catch(() => {});

// ------------------------------------------
// 4. Toast Notification
// ------------------------------------------
function showToast(msg, duration = 3000) {
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
// 7. Input Resize & Keyboard
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
// 8. Chat UI Helpers
// ------------------------------------------
function scrollToBottom() {
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
}

function hidePlaceholder() {
    if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
}

function showPlaceholder() {
    if (emptyPlaceholder) {
        // Re-attach if it was removed from DOM
        if (!chatBox.contains(emptyPlaceholder)) {
            chatBox.appendChild(emptyPlaceholder);
        }
        emptyPlaceholder.style.display = "";
    }
}

function clearChatDisplay() {
    // Remove all message nodes but preserve the emptyPlaceholder reference
    const nodes = Array.from(chatBox.childNodes);
    nodes.forEach(node => {
        if (node !== emptyPlaceholder) chatBox.removeChild(node);
    });
    showPlaceholder();
    chatContext = [];
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
    const iconMap  = { image: "fa-image", pdf: "fa-file-pdf", text: "fa-file-lines" };
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
// 9. Core Send Logic
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
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: chatContext.slice(-12),  // Last 12 turns for context
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
// 10. SMART FILE HANDLER — 3 Distinct Paths
// ------------------------------------------

// Utility: categorize file type
function getFileCategory(mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/pdf") return "pdf";
    return "text";
}

// Utility: icon class for file type
function getFileIcon(mimeType) {
    return {
        image: "fa-file-image",
        pdf:   "fa-file-pdf",
        text:  "fa-file-lines"
    }[getFileCategory(mimeType)] || "fa-file";
}

// OCR progress helper
function updateOcrProgress(percent) {
    ocrProgressBar.classList.add("show");
    ocrProgressFill.style.width = `${Math.min(percent, 100)}%`;
}

// Attach button
attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
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

// ---- Main file dispatch ----
async function processAndSendFile(file) {
    const cat          = getFileCategory(file.type);
    const userTypedText = inputBox.value.trim();

    addFileMessageBubble(file);
    inputBox.value = "";
    resizeInput();
    fileChipStatus.textContent = "Processing...";
    updateOcrProgress(5);

    let extractedText = "";

    try {
        if (cat === "image") {
            // PATH C — Image upload with preprocessing
            extractedText = await extractTextFromImage(file);
        } else if (cat === "pdf") {
            // PATH A first (fast), falls back to PATH B (OCR) if needed
            extractedText = await extractTextFromPDF(file);
        } else {
            // Plain text / CSV
            extractedText = await readTextFile(file);
        }
    } catch (err) {
        console.error("File processing error:", err);
        addMessage("❌ File process nahi hua. Please try again.", "bot");
        clearFileAttachment();
        return;
    }

    updateOcrProgress(100);

    // Build context message sent to AI
    let contextMsg = `[📎 File: ${file.name}]\n`;
    if (extractedText.trim().length > 0) {
        const trimmed = extractedText.trim().slice(0, 3000);
        contextMsg += `\nExtracted Content:\n"""\n${trimmed}\n"""`;
    } else {
        contextMsg += "\n[No readable text found in this file]";
        showToast("⚠️ No text could be extracted from this file.");
    }
    if (userTypedText) {
        contextMsg += `\n\nUser says: ${userTypedText}`;
    }

    chatContext.push({ role: "user", content: contextMsg });
    await saveMessageToDB("user", contextMsg);
    clearFileAttachment();
    await callAPI();
}

// ==========================================
// PATH A — Searchable PDF (fastest)
// Uses pdf.js to extract embedded text directly.
// If extracted text is < 60 chars, it's likely a scanned
// PDF with no real text, so we fall through to PATH B.
// ==========================================
async function extractTextFromPDF(file) {
    fileChipStatus.textContent = "Reading PDF text...";
    updateOcrProgress(10);

    const pdfjsLib = window["pdfjs-dist/build/pdf"];
    if (!pdfjsLib) throw new Error("PDF.js not loaded");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page        = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText    = textContent.items.map(item => item.str).join(" ");
        fullText += `\n--- Page ${i} ---\n${pageText}`;
        updateOcrProgress(10 + Math.round((i / pdf.numPages) * 40));
    }

    // PATH B fallback — scanned/image-based PDF
    if (fullText.trim().length < 60) {
        showToast("📄 Scanned PDF detected — switching to OCR...");
        return extractTextFromScannedPDF(pdf);
    }

    return fullText;
}

// ==========================================
// PATH B — Scanned / Image PDF via OCR
// Renders each page onto a hidden canvas at 2× scale,
// then passes the canvas to the global Tesseract worker.
// ==========================================
async function extractTextFromScannedPDF(pdf) {
    fileChipStatus.textContent = "Scanned PDF — Running page OCR...";
    updateOcrProgress(50);

    const worker = await getTesseractWorker();
    const canvas  = document.createElement("canvas");
    const ctx     = canvas.getContext("2d");
    let   fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page     = await pdf.getPage(i);
        // Render at 2× scale — significantly improves OCR accuracy
        const viewport = page.getViewport({ scale: 2.0 });
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;

        fileChipStatus.textContent = `OCR: Page ${i} of ${pdf.numPages}...`;
        const { data: { text } } = await worker.recognize(canvas);
        fullText += `\n--- Page ${i} ---\n${text}`;

        updateOcrProgress(50 + Math.round((i / pdf.numPages) * 45));
    }

    return fullText;
}

// ==========================================
// PATH C — Direct Image Upload with Pre-processing
// Applies grayscale + contrast enhancement on a canvas
// before passing to Tesseract, which materially improves
// accuracy on low-contrast, color, or noisy images.
// ==========================================
async function extractTextFromImage(file) {
    fileChipStatus.textContent = "Preprocessing image...";
    updateOcrProgress(10);

    const processedCanvas = await preprocessImageForOCR(file);
    updateOcrProgress(20);

    fileChipStatus.textContent = "Running OCR...";
    const worker = await getTesseractWorker();
    const { data: { text } } = await worker.recognize(processedCanvas);

    return text;
}

/**
 * Preprocess an image for better OCR accuracy:
 * 1. Scale up if small (max 1600px on longest side)
 * 2. Convert to grayscale (removes color noise)
 * 3. Boost contrast (makes text edges sharper)
 *
 * @param {File} file - The image file
 * @returns {Promise<HTMLCanvasElement>} Processed canvas ready for Tesseract
 */
async function preprocessImageForOCR(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            // Scale up small images for better OCR, cap at 1600px
            const maxDim = 1600;
            const scale  = Math.min(2.0, maxDim / Math.max(img.width, img.height, 1));

            const canvas = document.createElement("canvas");
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Apply grayscale + contrast filter pixel-by-pixel
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data      = imageData.data;
            const CONTRAST  = 1.6; // 1.0 = no change, >1 = more contrast

            for (let i = 0; i < data.length; i += 4) {
                // Luminance-weighted grayscale (ITU-R BT.601)
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                // Contrast: expand distance from midpoint (128)
                const c    = Math.max(0, Math.min(255, (gray - 128) * CONTRAST + 128));
                data[i] = data[i + 1] = data[i + 2] = c; // R = G = B (grayscale)
                // data[i + 3] stays the same (alpha unchanged)
            }

            ctx.putImageData(imageData, 0, 0);
            URL.revokeObjectURL(url);
            resolve(canvas);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Image load failed"));
        };

        img.src = url;
    });
}

// ==========================================
// Plain text / CSV reader
// ==========================================
async function readTextFile(file) {
    fileChipStatus.textContent = "Reading file...";
    updateOcrProgress(60);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = (e) => resolve(e.target.result || "");
        reader.onerror = reject;
        reader.readAsText(file, "UTF-8");
    });
}

// ------------------------------------------
// 11. Microphone — Web Speech API
// ------------------------------------------
function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        showToast("⚠️ Voice input not supported. Use Chrome.");
        return false;
    }

    recognition               = new SR();
    recognition.lang          = "hi-IN";   // Hinglish: Hindi + English
    recognition.interimResults = true;
    recognition.continuous    = false;
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
        const t = inputBox.value.trim();
        if (t) setTimeout(() => handleSendAction(), 300);
    };

    recognition.onerror = (e) => {
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
        recognition.stop();
        setTimeout(() => recognition.start(), 300);
    }
});

// ------------------------------------------
// 12. Send Button
// ------------------------------------------
sendBtn.addEventListener("click", handleSendAction);

// ------------------------------------------
// 13. Clear & New Chat
// ------------------------------------------
clearBtn.addEventListener("click", async () => {
    if (!confirm("Bhai, saari chat delete kar doon? 🗑️")) return;
    await clearSessionDB();
    // clearSessionDB reloads the page — code below is a safety net
    clearChatDisplay();
    showToast("Chat cleared ✓");
});

newChatBtn.addEventListener("click", () => {
    inputBox.focus();
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
});

// ------------------------------------------
// 14. Google Auth — Login / Logout
// ------------------------------------------
loginBtn?.addEventListener("click", async () => {
    try {
        await signInWithGoogle();
        // onAuthStateChange callback below fires automatically after this
    } catch (e) {
        console.error("Sign-in error:", e);
        if (e.code !== "auth/popup-closed-by-user") {
            showToast("⚠️ Sign in failed. Please try again.");
        }
    }
});

logoutBtn?.addEventListener("click", async () => {
    if (!confirm("Sign out karna chahte ho?")) return;
    try {
        await signOutUser();
        showToast("Signed out ✓");
        // onAuthStateChange fires automatically — UI and chat will reset
    } catch (e) {
        showToast("⚠️ Sign out failed.");
    }
});

// ------------------------------------------
// 15. Auth State — Drives ALL UI + Chat Init
// onAuthStateChanged fires:
//   (a) immediately on page load with current state
//   (b) whenever auth state changes (login/logout)
// We use this as the SINGLE trigger for loading chats.
// ------------------------------------------
onAuthStateChange(async (user) => {
    if (user) {
        // ---- Logged-in state ----
        const firstName = user.displayName?.split(" ")[0] || "User";

        // Header badge
        loginBtn.style.display            = "none";
        userProfileBadge.style.display    = "flex";
        userAvatarHeader.src              = user.photoURL  || "";
        userAvatarHeader.title            = user.displayName || user.email;
        userFirstName.textContent         = firstName;

        // Sidebar panel
        sidebarUserPanel.style.display    = "flex";
        sidebarUserAvatar.src             = user.photoURL  || "";
        sidebarUserName.textContent       = user.displayName || "User";
        sidebarUserEmail.textContent      = user.email || "";

        // Logout btn in sidebar footer
        logoutBtn.style.display           = "inline-flex";

        showToast(`Welcome back, ${firstName}! ✨`);

    } else {
        // ---- Guest / logged-out state ----
        loginBtn.style.display            = "flex";
        userProfileBadge.style.display    = "none";
        sidebarUserPanel.style.display    = "none";
        logoutBtn.style.display           = "none";
    }

    // Reload chats for the current user (uid or guestId)
    // Guard prevents double-load on rapid auth state changes
    clearChatDisplay();
    chatInitDone = false;
    await initChat();
});

// ------------------------------------------
// 16. Init — Load history from Firestore
// Only loads messages belonging to the current user.
// ------------------------------------------
async function initChat() {
    if (chatInitDone) return;
    chatInitDone = true;

    try {
        const history = await loadHistoryFromDB(20);
        if (history.length > 0) {
            hidePlaceholder();
            history.forEach(m => {
                const role = m.role === "user" ? "user" : "bot";
                addMessage(m.content, role);
                chatContext.push({ role: m.role, content: m.content });
            });
        }
    } catch (err) {
        console.error("Chat init error:", err);
    }
}
