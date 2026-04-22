// ==========================================
// Shanu AI — Firebase Configuration & Helpers v2
// Developer: Shiva Saini
// ==========================================

import { initializeApp }       from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    deleteDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

// ---- Firebase Project Config ----
// Replace with your own project credentials from Firebase Console
const firebaseConfig = {
    apiKey:            "AIzaSyCBAQgLhVaNcH1YS_qldqKTJ9Kg-JO9A74",
    authDomain:        "shanu-ai.firebaseapp.com",
    projectId:         "shanu-ai",
    storageBucket:     "shanu-ai.firebasestorage.app",
    messagingSenderId: "225114447873",
    appId:             "1:225114447873:web:408763c5b259506506a000"
};

// Initialize
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ---- Session ID ----
// Unique per browser — persists across page refreshes
let sessionId = localStorage.getItem("shanu_session_id");
if (!sessionId) {
    sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 7);
    localStorage.setItem("shanu_session_id", sessionId);
}

// ==========================================
// Exported Helper Functions
// ==========================================

/**
 * Save a single message to Firestore
 * @param {string} role    - "user" or "assistant"
 * @param {string} content - Message text
 */
export async function saveMessageToDB(role, content) {
    try {
        // Truncate very long file-context messages before saving (3500 char cap)
        const safeContent = content.length > 3500 ? content.slice(0, 3500) + "\n...[truncated]" : content;

        await addDoc(collection(db, "chats"), {
            sessionId,
            role,
            content: safeContent,
            timestamp: serverTimestamp()   // Use server timestamp for consistency
        });
    } catch (e) {
        // Non-fatal — app still works without save
        console.warn("Firestore Save Warning:", e.message);
    }
}

/**
 * Load recent chat history for the current session
 * @param {number} limitCount - How many messages to fetch (default: 20)
 * @returns {Array} Array of { role, content } objects
 */
export async function loadHistoryFromDB(limitCount = 20) {
    try {
        const q = query(
            collection(db, "chats"),
            where("sessionId", "==", sessionId),
            orderBy("timestamp", "asc"),
            // ↑ NOTE: First time use may throw an index error in console.
            //   Follow the link in the error to create the Firestore composite index.
            //   This is a one-time setup. Details in README.md.
            limit(limitCount)
        );

        const snapshot = await getDocs(q);
        const messages = [];
        snapshot.forEach(d => messages.push(d.data()));
        return messages;

    } catch (e) {
        // If index hasn't been created yet, silently fail and return empty array
        if (e.code === "failed-precondition" || e.message?.includes("index")) {
            console.warn(
                "⚠️ Firestore index missing. Please create it using the link in the browser console error.",
                "\nChat history will be empty until the index is ready."
            );
        } else {
            console.error("Firestore Load Error:", e);
        }
        return [];
    }
}

/**
 * Delete all messages for the current session and reset the session ID
 */
export async function clearSessionDB() {
    try {
        const q = query(
            collection(db, "chats"),
            where("sessionId", "==", sessionId)
        );
        const snapshot = await getDocs(q);

        // Batch delete all documents
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "chats", d.id)));
        await Promise.all(deletePromises);

        // Generate fresh session ID
        const newId = "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 7);
        localStorage.setItem("shanu_session_id", newId);

        // Reload to reset all state cleanly
        location.reload();

    } catch (e) {
        console.error("Firestore Clear Error:", e);
        // Reload anyway — worst case is messages aren't deleted from Firestore
        location.reload();
    }
}

// Export db instance for any direct usage
export { db };
