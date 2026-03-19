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
// Moods list
// --------------------------
const MOODS = [
  { value: "normal", label: "😌 Normal" },
  { value: "flirty", label: "😉 Flirty (safe)" },
  { value: "girlfriend", label: "❤️ Girlfriend (caring)" },
  { value: "boyfriend", label: "🛡️ Boyfriend (caring)" },
  { value: "rude", label: "😏 Sarcastic (polite)" },
  { value: "baby", label: "👶 Innocent Baby" },
  { value: "roast", label: "🔥 Roast (safe)" },
  { value: "coach", label: "💪 Motivational Coach" }
];

// --------------------------
// Mood Dropdown Logic
// --------------------------
let currentMood = "normal";

// fill custom dropdown
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

// toggle dropdown
moodBtn.addEventListener("click", () => {
  moodList.style.display =
    moodList.style.display === "block" ? "none" : "block";
});

// close dropdown on outside click
document.addEventListener("click", (e) => {
  if (!e.target.closest(".mood-wrap")) {
    moodList.style.display = "none";
  }
});

// --------------------------
// Helper Functions
// --------------------------
function addMessage(text, type = "bot") {
  if (emptyPlaceholder) emptyPlaceholder.style.display = "none";

  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.textContent = text;

  chatBox.appendChild(div);
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });

  return div;
}

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "typing-indicator bot";
  wrap.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  chatBox.appendChild(wrap);
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
  return wrap;
}

// Auto resize textarea
function resizeInput() {
  inputBox.style.height = "auto";
  inputBox.style.height = Math.min(inputBox.scrollHeight, 140) + "px";
}
inputBox.addEventListener("input", resizeInput);

// --------------------------
// Send Message
// --------------------------
let sending = false;

async function sendMessage() {
  if (sending) return;

  const text = inputBox.value.trim();
  if (!text) return;

  sending = true;
  sendBtn.disabled = true;

  addMessage(text, "user");
  inputBox.value = "";
  resizeInput();

  const typing = showTyping();

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        mood: currentMood
      })
    });

    const data = await res.json();
    typing.remove();

    if (data.reply) {
      addMessage(data.reply, "bot");
    } else {
      addMessage("❌ Error: Invalid response", "bot");
    }

  } catch (err) {
    typing.remove();
    addMessage("❌ Network error!", "bot");
  }

  sending = false;
  sendBtn.disabled = false;
}

// --------------------------
// Events
// --------------------------
sendBtn.addEventListener("click", sendMessage);

inputBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Clear chat
clearBtn.addEventListener("click", () => {
  chatBox.innerHTML = "";
  chatBox.appendChild(emptyPlaceholder);
  emptyPlaceholder.style.display = "block";
});

// Focus input
inputBox.focus();

/*

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
// Memory (LOCAL STORAGE)
// --------------------------
let conversation = JSON.parse(localStorage.getItem("chat")) || [];

// --------------------------
// Moods
// --------------------------
const MOODS = [
  { value: "normal", label: "😌 Normal" },
  { value: "flirty", label: "😉 Flirty" },
  { value: "girlfriend", label: "❤️ Girlfriend" },
  { value: "boyfriend", label: "🛡️ Boyfriend" },
  { value: "baby", label: "👶 Baby" },
  { value: "roast", label: "🔥 Roast (funny)" },
  { value: "coach", label: "💪 Coach" }
];

let currentMood = "normal";

// --------------------------
// Load old chat
// --------------------------
function loadChat() {
  if (conversation.length === 0) return;

  emptyPlaceholder.style.display = "none";

  conversation.forEach(msg => {
    addMessage(msg.content, msg.role === "user" ? "user" : "bot");
  });
}

loadChat();

// --------------------------
// Mood Dropdown
// --------------------------
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
  moodList.style.display =
    moodList.style.display === "block" ? "none" : "block";
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".mood-wrap")) {
    moodList.style.display = "none";
  }
});

// --------------------------
// UI Helpers
// --------------------------
function addMessage(text, type = "bot") {
  emptyPlaceholder.style.display = "none";

  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.textContent = text;

  chatBox.appendChild(div);
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
}

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "typing-indicator bot";
  wrap.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  chatBox.appendChild(wrap);
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
  return wrap;
}

function resizeInput() {
  inputBox.style.height = "auto";
  inputBox.style.height = Math.min(inputBox.scrollHeight, 140) + "px";
}
inputBox.addEventListener("input", resizeInput);

// --------------------------
// SEND MESSAGE
// --------------------------
let sending = false;

async function sendMessage() {
  if (sending) return;

  const text = inputBox.value.trim();
  if (!text) return;

  sending = true;
  sendBtn.disabled = true;

  addMessage(text, "user");

  // Save user message
  conversation.push({ role: "user", content: text });

  inputBox.value = "";
  resizeInput();

  const typing = showTyping();

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: conversation,
        mood: currentMood
      })
    });

    const data = await res.json();
    typing.remove();

    const reply = data.reply || "⚠️ No response";

    addMessage(reply, "bot");

    // Save bot reply
    conversation.push({ role: "assistant", content: reply });

    // Save to localStorage
    localStorage.setItem("chat", JSON.stringify(conversation));

  } catch (err) {
    typing.remove();
    addMessage("❌ Network error!", "bot");
  }

  sending = false;
  sendBtn.disabled = false;
}

// --------------------------
// EVENTS
// --------------------------
sendBtn.addEventListener("click", sendMessage);

inputBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Clear chat
clearBtn.addEventListener("click", () => {
  conversation = [];
  localStorage.removeItem("chat");

  chatBox.innerHTML = "";
  chatBox.appendChild(emptyPlaceholder);
  emptyPlaceholder.style.display = "block";
});

inputBox.focus();
