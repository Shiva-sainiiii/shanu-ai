// --------------------------
// Elements
// --------------------------
const chatBox = document.getElementById("chat");
const inputBox = document.getElementById("inputBox");
const sendBtn = document.getElementById("sendBtn");
const moodSelect = document.getElementById("moodSelect");
const clearBtn = document.getElementById("clearBtn");
const emptyPlaceholder = document.getElementById("emptyPlaceholder");

// --------------------------
// Moods list
// --------------------------
const MOODS = [
  { value: "normal", label: "Normal" },
  { value: "flirty", label: "Flirty (safe)" },
  { value: "girlfriend", label: "Girlfriend (caring)" },
  { value: "boyfriend", label: "Boyfriend (caring)" },
  { value: "rude", label: "Sarcastic (polite)" },
  { value: "baby", label: "Innocent Baby" },
  { value: "roast", label: "Roast (safe)" },
  { value: "coach", label: "Motivational Coach" }
];

// Fill dropdown
MOODS.forEach(m => {
  const opt = document.createElement("option");
  opt.value = m.value;
  opt.innerText = m.label;
  moodSelect.appendChild(opt);
});
moodSelect.value = "normal";


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

  const mood = moodSelect.value;

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        mood: mood
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
