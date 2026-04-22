// ==========================================
// Shanu AI - Main Chat Logic
// Developer: Shiva Saini
// ==========================================

// Firebase functions ko import kar rahe hain (Ye hum agle step me Firebase.js me banayenge)
import { saveMessageToDB, loadHistoryFromDB, clearSessionDB } from './firebase.js';

// ------------------------------------------
// 1. DOM Elements
// ------------------------------------------
const chatBox = document.getElementById("chat");
const inputBox = document.getElementById("inputBox");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const newChatBtn = document.getElementById("newChatBtn");
const emptyPlaceholder = document.getElementById("emptyPlaceholder");

// Mood Selectors
const moodBtn = document.getElementById("moodBtn");
const moodList = document.getElementById("moodList");
const currentMoodLabel = document.getElementById("currentMoodLabel");
const recentMoodsContainer = document.getElementById("recentMoods");

// ------------------------------------------
// 2. State & Configuration
// ------------------------------------------
let currentMood = "normal";
let sending = false;
let chatContext = []; // API ko context bhejne ke liye local array

const MOODS = [
    { value: "normal", label: "😌 Normal" },
    { value: "flirty", label: "😉 Flirty" },
    { value: "girlfriend", label: "❤️ Girlfriend" },
    { value: "boyfriend", label: "🛡️ Boyfriend" },
    { value: "rude", label: "😏 Sarcastic" },
    { value: "baby", label: "👶 Baby" },
    { value: "roast", label: "🔥 Roast" },
    { value: "coach", label: "💪 Coach" }
];

// ------------------------------------------
// 3. UI Initialization & Dropdown Logic
// ------------------------------------------

// Dropdown me moods populate karna
MOODS.forEach(m => {
    const div = document.createElement("div");
    div.className = "mood-item";
    div.textContent = m.label;
    
    div.addEventListener("click", () => {
        currentMood = m.value;
        currentMoodLabel.textContent = m.label;
        moodList.style.display = "none";
        updateRecentMoods(m);
    });
    
    moodList.appendChild(div);
});

// Dropdown Toggle
moodBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    moodList.style.display = moodList.style.display === "block" ? "none" : "block";
});

// Bahar click karne pe dropdown band ho jaye
document.addEventListener("click", () => {
    moodList.style.display = "none";
});

// Sidebar me Recent Moods update karna
function updateRecentMoods(moodObj) {
    const existing = Array.from(recentMoodsContainer.children);
    const isAlreadyThere = existing.some(el => el.dataset.value === moodObj.value);
    
    if (!isAlreadyThere) {
        const btn = document.createElement("button");
        btn.className = "nav-item";
        btn.dataset.value = moodObj.value;
        btn.innerHTML = `<i class="fa-solid fa-clock-rotate-left" style="font-size: 12px;"></i> ${moodObj.label}`;
        btn.onclick = () => {
            currentMood = moodObj.value;
            currentMoodLabel.textContent = moodObj.label;
        };
        recentMoodsContainer.prepend(btn);
        
        // Sirf top 3 recent moods rakho sidebar me
        if (recentMoodsContainer.children.length > 3) {
            recentMoodsContainer.lastChild.remove();
        }
    }
}

// ------------------------------------------
// 4. Chat Core Functions
// ------------------------------------------

// Message UI me add karna
function addMessage(text, type = "bot") {
    if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
    
    const div = document.createElement("div");
    div.className = `msg ${type}`;
    div.textContent = text;
    
    chatBox.appendChild(div);
    scrollToBottom();
}

// Typing Animation dikhana
function showTyping() {
    if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
    
    const wrap = document.createElement("div");
    wrap.className = "typing-indicator bot";
    wrap.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    
    chatBox.appendChild(wrap);
    scrollToBottom();
    return wrap;
}

function scrollToBottom() {
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
}

function resizeInput() {
    inputBox.style.height = "auto";
    inputBox.style.height = Math.min(inputBox.scrollHeight, 120) + "px";
}

// ------------------------------------------
// 5. Send Message & API Call
// ------------------------------------------
async function sendMessage() {
    const text = inputBox.value.trim();
    if (!text || sending) return;

    // Lock UI
    sending = true;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    // User Message process karna
    addMessage(text, "user");
    inputBox.value = "";
    resizeInput();
    
    // Save to context & DB
    chatContext.push({ role: "user", content: text });
    await saveMessageToDB("user", text);

    const typingIndicator = showTyping();

    try {
        // API Call to /api/ask
        const res = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: chatContext.slice(-10), // Last 10 messages bhejein context ke liye
                mood: currentMood
            })
        });

        const data = await res.json();
        typingIndicator.remove();

        const reply = data.reply || "Kuch error aa gaya... 🧐";
        
        // Bot Message process karna
        addMessage(reply, "bot");
        chatContext.push({ role: "assistant", content: reply });
        await saveMessageToDB("assistant", reply);

    } catch (err) {
        console.error("API Error:", err);
        typingIndicator.remove();
        addMessage("❌ Network error! Shanu AI se connect nahi ho paaya.", "bot");
    }

    // Unlock UI
    sending = false;
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    inputBox.focus();
}

// ------------------------------------------
// 6. Initialization & Event Listeners
// ------------------------------------------

// Startup par purani chat load karna
async function initChat() {
    const history = await loadHistoryFromDB(20);
    if (history.length > 0) {
        if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
        
        history.forEach(m => {
            const role = m.role === "user" ? "user" : "bot";
            addMessage(m.content, role);
            chatContext.push({ role: m.role, content: m.content });
        });
    }
}

// Events
sendBtn.addEventListener("click", sendMessage);

inputBox.addEventListener("input", resizeInput);

inputBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Clear Chat Logic
clearBtn.addEventListener("click", async () => {
    if(confirm("Bhai, saari chat delete kar doon?")) {
        await clearSessionDB();
        chatBox.innerHTML = "";
        chatBox.appendChild(emptyPlaceholder);
        emptyPlaceholder.style.display = "block";
        chatContext = [];
    }
});

newChatBtn.addEventListener("click", () => {
    inputBox.focus();
});

// Start the app
document.addEventListener("DOMContentLoaded", initChat);
      
