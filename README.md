# 🌌 Shanu AI — Next-Gen Mood-Based Chatbot

<div align="center">

![Shanu AI Banner](https://img.shields.io/badge/Shanu%20AI-Next--Gen%20Chatbot-blueviolet?style=for-the-badge&logo=openai&logoColor=white)

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)

**A premium, context-aware AI chatbot with Glassmorphism UI, mood-based personalities, and persistent chat history.**

Developed with ❤️ by **[Shiva Saini](https://github.com/shiva-sainiiii)**

[Live Demo](#) • [Report Bug](https://github.com/shiva-sainiiii/shanu-ai/issues) • [Request Feature](https://github.com/shiva-sainiiii/shanu-ai/issues)

</div>

---

## 📖 Table of Contents

- [About the Project](#-about-the-project)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Folder Structure](#-folder-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Firestore Index Setup](#-firestore-index-setup)
- [Branding](#-branding)
- [License](#-license)

---

## 🧩 About the Project

**Shanu AI** is a next-generation, mood-aware conversational chatbot that dynamically adapts its personality based on user-selected moods. Built with a sleek **Glassmorphism UI** and powered by **Firebase Firestore**, all your conversations are securely stored and persist across sessions — so you never lose a chat.

Whether you want a witty roast partner, a sarcastic companion, or a supportive friend, Shanu AI has a personality for every vibe.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🎭 **Mood Selector** | 8+ unique moods (Girlfriend, Boyfriend, Roast, Sarcastic, and more) that reshape the AI's entire personality |
| 💎 **Glassmorphism UI** | Modern frosted-glass aesthetic with fluid blob animations and a polished dark theme |
| 💾 **Persistent Memory** | Firebase Firestore integration ensures chat history survives page refreshes and device switches |
| 🧠 **Contextual Intelligence** | Maintains full conversation context so responses feel natural and coherent |
| 📱 **Responsive Design** | Seamlessly adapts to mobile and desktop screen sizes |
| ⚡ **Pro Sidebar** | Quick navigation panel with recent mood history tracking |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3 (Glassmorphism), JavaScript ES6+ Modules |
| **Database** | Firebase Firestore (Real-time NoSQL) |
| **AI Engine** | OpenRouter API — Nvidia Nemotron / Open-source LLMs |
| **Deployment** | Vercel (Serverless Functions) |
| **Icons** | Font Awesome 6.4.0 |
| **Fonts** | Plus Jakarta Sans (Google Fonts) |

---

## 📁 Folder Structure

```
shanu-ai/
│
├── index.html          # Main UI layout and structure
├── style.css           # Glassmorphism styling & animations
├── chat.js             # Core UI logic & message handling
├── firebase.js         # Firebase connection & Firestore helpers
│
└── api/
    └── ask.js          # Serverless backend — OpenRouter API handler (Vercel)
```

---

## 🚀 Getting Started

Follow these steps to get Shanu AI running locally.

### Prerequisites

- A [Firebase](https://firebase.google.com/) account
- An [OpenRouter](https://openrouter.ai/) API key
- A [Vercel](https://vercel.com/) account (for deployment)
- [Node.js](https://nodejs.org/) installed (for local Vercel dev)

### 1. Clone the Repository

```bash
git clone https://github.com/shiva-sainiiii/shanu-ai.git
cd shanu-ai
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. Navigate to **Firestore Database** → click **Create Database** → select **Test mode**.
3. Open `firebase.js` and replace the placeholder config with your own Firebase project credentials:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. Deploy to Vercel

1. Push the project to your GitHub repository.
2. Import the repo in your [Vercel Dashboard](https://vercel.com/dashboard).
3. Add the required environment variable (see below).
4. Click **Deploy**.

---

## 🔑 Environment Variables

Set the following environment variable in your Vercel project dashboard under **Settings → Environment Variables**:

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | Your API key from [OpenRouter](https://openrouter.ai/) |

> ⚠️ **Never commit your API key to a public repository.**

---

## 🗂️ Firestore Index Setup

Shanu AI uses a composite Firestore query that requires a manual index to be created on first use.

1. Send your **first message** in the app.
2. Open **Browser DevTools** (`F12`) → navigate to the **Console** tab.
3. You will see a Firebase error with a direct link to create the required index.
4. Click that link — it will open Firebase Console with the index pre-configured.
5. Click **Create Index** and wait ~2 minutes for it to build.

> ✅ This is a one-time setup. Once created, the index persists permanently.

---

## 🎨 Branding

This project is part of the **Shanu AI Ecosystem**.

> *"Shanu AI by Shiva Saini"* — Building smarter, moodier, more human conversations.

---

## 📄 License

This project is open for **educational and personal use**. Feel free to fork, modify, and build upon it.

If you use this project as a base, a credit to the original author would be appreciated. 🙏

---

<div align="center">

Made with 💜 by **Shiva Saini** — [GitHub](https://github.com/shiva-sainiiii)

⭐ **Star this repo** if you found it useful!

</div>
