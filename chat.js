const chatBox = document.getElementById("chat");
const inputBox = document.getElementById("inputBox");
const sendBtn = document.getElementById("sendBtn");
const moodSelect = document.getElementById("moodSelect");

// Send message to backend
async function sendMessage() {
  const text = inputBox.value.trim();
  if (!text) return;

  addMessage(text, "user");
  inputBox.value = "";

  const mood = moodSelect.value;

  const typing = showTyping();

  const res = await fetch("/api/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: text,
      mood: mood
    })
  });

  const data = await res.json();

  typing.remove();
  addMessage(data.reply, "bot");
}Storage.getItem("shanu_mood") || "normal";
moodSelect.addEventListener("change", () => {
  localStorage.setItem("shanu_mood", moodSelect.value);
});

// auto-resize input
function resizeInput() {
  inputBox.style.height = "auto";
  inputBox.style.height = Math.min(inputBox.scrollHeight, 140) + "px";
}
inputBox.addEventListener("input", resizeInput);
resizeInput();

// helpers
function addMessage(text, type = "bot", options = {}) {
  // remove placeholder
  if (emptyPlaceholder) emptyPlaceholder.style.display = "none";

  const div = document.createElement("div");
  div.className = `msg ${type}`;
  if (options.isError) div.classList.add("error");
  div.innerText = text;
  chatBox.appendChild(div);
  smoothScrollToBottom();
  return div;
}

function smoothScrollToBottom() {
  chatBox.scrollTo({ top: chatBox.scrollHeight + 200, behavior: "smooth" });
}

// typing indicator
function createTypingIndicator() {
  const wrap = document.createElement("div");
  wrap.className = "typing bot";
  wrap.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
  chatBox.appendChild(wrap);
  smoothScrollToBottom();
  return wrap;
}

// debounce to prevent spammy sends
let sending = false;
function canSend() {
  return !sending;
}

// send message
async function sendMessage() {
  if (!canSend()) return;
  const userMsg = inputBox.value.trim();
  if (!userMsg) return;

  // add user message
  addMessage(userMsg, "user");
  inputBox.value = "";
  resizeInput();

  // build payload for server endpoint
  const mood = moodSelect.value || "normal";
  const systemPrompt = moodToSystemPrompt(mood);
  localStorage.setItem("shanu_mood", mood);

  const typing = createTypingIndicator();
  sending = true;
  sendBtn.disabled = true;

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        system: systemPrompt,
        user: userMsg,
        max_tokens: 500,
        temperature: 1.0
      })
    });

    const data = await res.json();
    if (!res.ok) {
      const errText = data?.error || data?.message || JSON.stringify(data);
      typing.remove();
      addMessage("API Error: " + errText, "bot", { isError: true });
      console.error("API error:", data);
      return;
    }

    // remove typing indicator
    if (typing && typing.parentNode) typing.parentNode.removeChild(typing);

    // robust extraction
    const botText =
      (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
      data.response ||
      data.text ||
      (typeof data === "string" ? data : JSON.stringify(data));

    // safety: limit length displayed
    const safeBotText = botText.toString().trim();

    addMessage(safeBotText, "bot");

  } catch (err) {
    if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
    addMessage("Network Error: " + (err.message || err), "bot", { isError: true });
    console.error(err);
  } finally {
    sending = false;
    sendBtn.disabled = false;
  }
}

// keyboard events
sendBtn.addEventListener("click", sendMessage);
inputBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// clear chat
clearBtn.addEventListener("click", () => {
  chatBox.innerHTML = '';
  if (emptyPlaceholder) {
    chatBox.appendChild(emptyPlaceholder);
    emptyPlaceholder.style.display = "block";
  }
});

// focus input
inputBox.focus();