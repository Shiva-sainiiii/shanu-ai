// ==========================================
// Shanu AI — Firebase Configuration & Helpers v3
// Developer: Shiva Saini
// Fix: Auth race condition, anonymous sign-in, strict userId filtering
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
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
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

// ---- Firebase Config ----
const firebaseConfig = {
    apiKey:            "AIzaSyCBAQgLhVaNcH1YS_qldqKTJ9Kg-JO9A74",
    authDomain:        "shanu-ai.firebaseapp.com",
    projectId:         "shanu-ai",
    storageBucket:     "shanu-ai.firebasestorage.app",
    messagingSenderId: "225114447873",
    appId:             "1:225114447873:web:408763c5b259506506a000"
};

// ---- Initialize ----
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ==========================================
// Auth Helpers
// ==========================================

/**
 * Trigger anonymous sign-in if not already authenticated.
 * Safe to call multiple times — idempotent.
 * @returns {Promise<User>}
 */
export async function initAuth() {
    if (auth.currentUser) return auth.currentUser;
    try {
        const credential = await signInAnonymously(auth);
        return credential.user;
    } catch (e) {
        console.warn("⚠️ Anonymous auth failed:", e.message);
        return null;
    }
}

/**
 * Returns a Promise that resolves ONLY after the Firebase auth state
 * has fully settled. Prevents race conditions in initChat().
 * @returns {Promise<User|null>}
 */
export function waitForAuth() {
    return new Promise(resolve => {
        // onAuthStateChanged fires immediately if auth state is already known
        const unsubscribe = onAuthStateChanged(auth, user => {
            unsubscribe(); // Detach listener after first resolution
            resolve(user);
        });
    });
}

/**
 * Get the current authenticated user's stable ID.
 * Falls back to a persisted guest ID if auth is unavailable.
 */
function getCurrentUserId() {
    if (auth.currentUser?.uid) return auth.currentUser.uid;

    // Fallback: persistent guest ID (edge case only)
    let guestId = localStorage.getItem("shanu_guest_id");
    if (!guestId) {
        guestId = "guest_" + Date.now() + "_" + Math.random().toString(36).substr(2, 7);
        localStorage.setItem("shanu_guest_id", guestId);
    }
    return guestId;
}

// ==========================================
// Firestore Helpers
// ==========================================

/**
 * Save a single message to Firestore under the current user's ID.
 * Includes serverTimestamp for consistent ordering.
 */
export async function saveMessageToDB(role, content) {
    try {
        const userId    = getCurrentUserId();
        const safeContent = content.length > 3500
            ? content.slice(0, 3500) + "\n...[truncated]"
            : content;

        await addDoc(collection(db, "chats"), {
            sessionId: userId,          // Strict per-user isolation
            role,
            content:   safeContent,
            timestamp: serverTimestamp() // Server-side timestamp — no clock skew
        });
    } catch (e) {
        console.warn("Firestore Save Warning:", e.message);
    }
}

/**
 * Load ordered chat history for the current authenticated user.
 * Uses composite index: (sessionId, timestamp ASC).
 */
export async function loadHistoryFromDB(limitCount = 30) {
    try {
        const userId = getCurrentUserId();

        const q = query(
            collection(db, "chats"),
            where("sessionId", "==", userId),   // Strict userId filter — no mixed chats
            orderBy("timestamp", "asc"),         // Chronological order
            limit(limitCount)
        );

        const snapshot = await getDocs(q);
        const messages = [];
        snapshot.forEach(d => messages.push(d.data()));
        return messages;

    } catch (e) {
        if (e.code === "failed-precondition" || e.message?.includes("index")) {
            console.warn(
                "⚠️ Firestore composite index missing.\n" +
                "Click the link in the error above to auto-create it.\n" +
                "Takes ~2 mins. One-time setup only."
            );
        } else {
            console.error("Firestore Load Error:", e);
        }
        return [];
    }
}

/**
 * Delete all messages for the current user and reload the app.
 */
export async function clearSessionDB() {
    try {
        const userId = getCurrentUserId();
        const q = query(
            collection(db, "chats"),
            where("sessionId", "==", userId)
        );
        const snapshot = await getDocs(q);
        const deletions = snapshot.docs.map(d => deleteDoc(doc(db, "chats", d.id)));
        await Promise.all(deletions);
    } catch (e) {
        console.error("Firestore Clear Error:", e);
    } finally {
        location.reload();
    }
}

export { db, auth };
