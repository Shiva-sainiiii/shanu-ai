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
    }
