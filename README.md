# 🌌 Shanu AI — Next-Gen Mood-Based Chatbot

<div align="center">

![Shanu AI Banner](https://img.shields.io/badge/Shanu%20AI-Next--Gen%20Chatbot-blueviolet?style=for-the-badge&logo=openai&logoColor=white)

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Cloudinary](https://img.shields.io/badge/Cloudinary-3448C5?style=flat-square&logo=cloudinary&logoColor=white)](https://cloudinary.com/)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)

**A premium, context-aware AI chatbot with Glassmorphism UI, mood-based personalities, AI image generation, and persistent chat history.**

Developed with ❤️ by **[Shiva Saini](https://github.com/shiva-sainiiii)**

[Live Demo](https://shanu-ai-iota.vercel.app/) • [Report Bug](https://github.com/shiva-sainiiii/shanu-ai/issues) • [Request Feature](https://github.com/shiva-sainiiii/shanu-ai/issues)

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

Beyond conversation, Shanu AI can generate images from text, export PDFs and PPTs, visualize data as charts, and spin up live HTML previews — all triggered by natural language, no buttons or menus needed.

Whether you want a witty roast partner, a sarcastic companion, or a supportive friend, Shanu AI has a personality for every vibe.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🎭 **Mood Selector** | 8+ unique moods (Girlfriend, Boyfriend, Roast, Sarcastic, and more) that reshape the AI's entire personality |
| 🎨 **Text-to-Image Generation** | Just ask — "banao ek sunset ki photo" — and Shanu generates a full AI image inline, powered by Pollinations.ai (free, no API key) |
| 👁️ **Dual-Mode Image Understanding** | Upload an image and choose **Document** (OCR text extraction via Tesseract) or **Photo** (AI Vision via Pollinations describes objects/scenes) — you decide, no guessing |
| ☁️ **Cloudinary Media Hosting** | User-uploaded images and AI-generated images are permanently hosted on Cloudinary — nothing expires or breaks |
| 💎 **Glassmorphism UI** | Modern frosted-glass aesthetic with fluid blob animations and a polished dark theme |
| 💾 **Persistent Memory (Firebase + LocalStorage)** | Firestore stores chat history in the cloud, with a localStorage write-through cache for instant loads and offline-safe fallback |
| 🧠 **Contextual Intelligence** | Maintains full conversation context so responses feel natural and coherent |
| 📄 **Smart Output Engine** | One tag system powers PDF export, PPT generation, Chart.js visualizations, and live HTML previews — all from natural language |
| 📱 **Responsive Design** | Seamlessly adapts to mobile and desktop screen sizes |
| ⚡ **Pro Sidebar** | Quick navigation panel with recent mood history tracking |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3 (Glassmorphism), JavaScript ES6+ Modules |
| **Database** | Firebase Firestore (Real-time NoSQL) + LocalStorage (instant-load cache) |
| **AI Engine** | OpenRouter API — Nvidia Nemotron / Open-source LLMs |
| **Image Generation** | Pollinations.ai (free text-to-image API, no key required) |
| **Media Hosting** | Cloudinary (permanent hosting for uploaded & AI-generated images) |
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
├── chat.js             # Core UI logic, message handling & Action Engine (PDF/PPT/Chart/Image/Preview)
├── firebase.js         # Firebase connection, Firestore helpers & LocalStorage backup layer
│
└── api/
    ├── ask.js          # Serverless backend — OpenRouter API handler (Vercel)
    └── upload.js       # Serverless backend — Cloudinary upload handler (Vercel)
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

### 3. Cloudinary Setup

1. Go to [Cloudinary Console](https://console.cloudinary.com/) and create a free account.
2. Copy your **Cloud Name** from the dashboard.
3. Navigate to **Settings → Upload → Upload presets → Add upload preset**.
4. Set **Signing Mode** to **Unsigned**, save, and copy the preset name.

### 4. Deploy to Vercel

1. Push the project to your GitHub repository.
2. Import the repo in your [Vercel Dashboard](https://vercel.com/dashboard).
3. Add the required environment variables (see below).
4. Click **Deploy**.

---

## 🔑 Environment Variables

Set the following environment variables in your Vercel project dashboard under **Settings → Environment Variables**:

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | Your API key from [OpenRouter](https://openrouter.ai/) |
| `CLOUDINARY_CLOUD_NAME` | Your cloud name from [Cloudinary Console](https://console.cloudinary.com/) |
| `CLOUDINARY_UPLOAD_PRESET` | An **unsigned** upload preset (Settings → Upload → Add upload preset → Signing Mode: Unsigned) |

> ⚠️ **Never commit your API keys to a public repository.**

---

## 🗂️ Firestore Index Setup

Shanu AI uses a composite Firestore query that requires a manual index to be created on first use.

1. Send your **first message** in the app.
2. Open **Browser DevTools** (`F12`) → navigate to the **Console** tab.
3. You will see a Firebase error with a direct link to create the required index.
4. Click that link — it will open Firebase Console with the index pre-configured.
5. Click **Create Index** and wait ~2 minutes for it to build.

> ✅ This is a one-time setup. Once created, the index persists permanently.

> 💡 **Note:** Even before the index is created, chat history won't be lost — Shanu AI writes every message to `localStorage` as a backup layer, so conversations render instantly and survive even if Firestore is temporarily unreachable.

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
