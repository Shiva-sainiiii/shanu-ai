// --------------------------
// Elements
// --------------------------
const chatBox = document.getElementById("chat");
const inputBox = document.getElementById("inputBox");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const emptyPlaceholder = document.getElementById("emptyPlaceholder");
const moodBtn = document.getElementById("moodBtn");
const moodList = document.getElementById("moodList");

// --------------------------
// Configuration & Session
// --------------------------
let currentMood = "normal";
let sending = false;

// Har user ke liye ek unique session ID (taaki chats mix na ho)
let sessionId = localStorage.getItem("shanu_session_id");
if (!sessionId) {
  sessionId = "session_" + Math.random().toString(36).substr(2, 9);
  localStorage.setItem("shanu_session_id", sessionId);
}

// --------------------------
// Moods Setup
// --------------------------
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

MOODS.forEach(m => {
  const div = document.createElement("div");
  div.className = "mood-item";
  div.textContent = m.label;
  div.addEventListener("click", () => {
    currentMood = m.value;
    moodBtn.textContent = m.label;
    moodList.style.display = "none";
  });
  moodList.appendChild(div);
});

moodBtn.addEventListener("click", () => {
  moodList.style.display = moodList.style.display === "block" ? "none" : "block";
});

// --------------------------
// Firestore Helpers
// --------------------------
const { collection, addDoc, query, where, orderBy, limit, getDocs } = window.fsHelpers;

async function saveMessage(role, content) {
  try {
    await addDoc(collection(window.db, "chats"), {
      sessionId: sessionId,
      role: role,
      content: content,
      timestamp: new Date()
    });
  } catch (e) {
    console.error("Firestore Save Error:", e);
  }
}

async function loadHistory(limitCount = 10) {
  const q = query(
    collection(window.db, "chats"),
    where("sessionId", "==", sessionId),
    orderBy("timestamp", "asc"),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  let msgs = [];
  snapshot.forEach(doc => msgs.push(doc.data()));
  return msgs;
}

// --------------------------
// UI Helpers
// --------------------------
function addMessage(text, type = "bot") {
  if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
}

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "typing-indicator bot";
  wrap.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
  chatBox.appendChild(wrap);
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
  return wrap;
}

function resizeInput() {
  inputBox.style.height = "auto";
  inputBox.style.height = Math.min(inputBox.scrollHeight, 140) + "px";
}

// --------------------------
// Core Logic
// --------------------------

// 1. Load purani chat on startup
async function initChat() {
  const history = await loadHistory(20); // Startup pe 20 messages dikhao
  if (history.length > 0) {
    emptyPlaceholder.style.display = "none";
    history.forEach(m => addMessage(m.content, m.role === "user" ? "user" : "bot"));
  }
}

// 2. Send Message
async function sendMessage() {
  if (sending) return;
  const text = inputBox.value.trim();
  if (!text) return;

  sending = true;
  sendBtn.disabled = true;

  // UI update aur Firestore mein save
  addMessage(text, "user");
  await saveMessage("user", text);

  inputBox.value = "";
  resizeInput();
  const typing = showTyping();

  try {
    // Context ke liye history fetch karo
    const history = await loadHistory(10);
    const messagesForAI = history.map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content
    }));

    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messagesForAI,
        mood: currentMood
      })
    });

    const data = await res.json();
    typing.remove();

    const reply = data.reply || "Kuch error aa gaya... 🧐";
    addMessage(reply, "bot");
    await saveMessage("assistant", reply);

  } catch (err) {
    typing.remove();
    addMessage("❌ Network error!", "bot");
  }

  sending = false;
  sendBtn.disabled = false;
}

// --------------------------
// Event Listeners
// --------------------------
sendBtn.addEventListener("click", sendMessage);

inputBox.addEventListener("input", resizeInput);
inputBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

clearBtn.addEventListener("click", () => {
  if(confirm("Saari chat delete kar doon?")) {
    // Note: Firestore se delete karne ke liye loop chalana padega, 
    // filhal session clear kar dete hain simple rakhne ke liye.
    localStorage.removeItem("shanu_session_id");
    location.reload(); 
  }
});

// Initialize
document.addEventListener("DOMContentLoaded", initChat);
inputBox.focus();
   
