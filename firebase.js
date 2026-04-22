// ==========================================
// Shanu AI — Firebase Configuration & Helpers v3
// Developer: Shiva Saini
// Upgrades: Google Auth, Hybrid Guest/UID Mode, Chat Privacy
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
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

// ---- Firebase Project Config ----
const firebaseConfig = {
    apiKey:            "AIzaSyCBAQgLhVaNcH1YS_qldqKTJ9Kg-JO9A74",
    authDomain:        "shanu-ai.firebaseapp.com",
    projectId:         "shanu-ai",
    storageBucket:     "shanu-ai.firebasestorage.app",
    messagingSenderId: "225114447873",
    appId:             "1:225114447873:web:408763c5b259506506a000"
};

// ---- Initialize Firebase ----
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// ==========================================
// Guest ID — Persistent for unauthenticated users
// Stored in localStorage so it survives page refreshes.
// Never changes unless the user clears localStorage.
// ==========================================
function getGuestId() {
    let guestId = localStorage.getItem("shanu_guest_id");
    if (!guestId) {
        guestId = "guest_" + Date.now() + "_" + Math.random().toString(36).substr(2, 7);
        localStorage.setItem("shanu_guest_id", guestId);
    }
    return guestId;
}

// ==========================================
// getCurrentUserId()
// Returns the Firebase uid for logged-in users,
// or the persistent guestId for anonymous visitors.
// All DB operations use this single source of truth.
// ==========================================
export function getCurrentUserId() {
    return auth.currentUser?.uid || getGuestId();
}

// ==========================================
// Auth Actions
// ==========================================

/**
 * Open Google Sign-In popup
 * @returns {Promise<UserCredential>}
 */
export async function signInWithGoogle() {
    return signInWithPopup(auth, googleProvider);
}

/**
 * Sign the current user out
 * @returns {Promise<void>}
 */
export async function signOutUser() {
    return signOut(auth);
}

/**
 * Subscribe to auth state changes
 * Fires immediately with current state (null = guest, User = logged in)
 * @param {function} callback - receives Firebase User | null
 * @returns {Unsubscribe} Call this to stop listening
 */
export function onAuthStateChange(callback) {
    return onAuthStateChanged(auth, callback);
}

// Export auth instance for direct use if needed
export { auth };

// ==========================================
// Firestore Helpers
// Each function resolves the correct userId at call time,
// so they always operate on the right user's data regardless
// of whether auth state changed since page load.
// ==========================================

/**
 * Save a single message to Firestore under the current user's ID
 * @param {string} role    - "user" | "assistant"
 * @param {string} content - Message text
 */
export async function saveMessageToDB(role, content) {
    try {
        const userId = getCurrentUserId();
        // Cap very long OCR/file context messages to avoid Firestore doc size limits
        const safeContent = content.length > 3500
            ? content.slice(0, 3500) + "\n...[truncated]"
            : content;

        await addDoc(collection(db, "chats"), {
            sessionId:  userId,          // Field name kept for Firestore index compatibility
            role,
            content:    safeContent,
            timestamp:  serverTimestamp()
        });
    } catch (e) {
        // Non-fatal — chat still works without persistence
        console.warn("⚠️ Firestore Save Warning:", e.message);
    }
}

/**
 * Load recent chat history for the current user
 * Authenticated users see ONLY their own chats (by uid).
 * Guests see ONLY their own chats (by guestId).
 * @param {number} limitCount - Max messages to fetch (default: 20)
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
export async function loadHistoryFromDB(limitCount = 20) {
    try {
        const userId = getCurrentUserId();

        const q = query(
            collection(db, "chats"),
            where("sessionId", "==", userId),
            orderBy("timestamp", "asc"),
            // ↑ NOTE: First use requires a Firestore composite index.
            //   Firebase will log a direct link to create it in the browser console.
            //   Click that link → Create Index → wait ~2 min. One-time setup only.
            limit(limitCount)
        );

        const snapshot = await getDocs(q);
        const messages = [];
        snapshot.forEach(d => messages.push(d.data()));
        return messages;

    } catch (e) {
        if (e.code === "failed-precondition" || e.message?.includes("index")) {
            console.warn(
                "⚠️ Firestore composite index missing!\n" +
                "Check the browser console for a Firebase link to create it.\n" +
                "Chat history will be empty until the index is built (~2 min)."
            );
        } else {
            console.error("Firestore Load Error:", e);
        }
        return [];
    }
}

/**
 * Delete all messages for the current user and reload the page cleanly.
 * For authenticated users, this wipes their uid-linked messages.
 * For guests, this wipes their guestId-linked messages.
 */
export async function clearSessionDB() {
    try {
        const userId = getCurrentUserId();

        const q = query(
            collection(db, "chats"),
            where("sessionId", "==", userId)
        );
        const snapshot = await getDocs(q);

        // Batch delete
        const deletePromises = snapshot.docs.map(d =>
            deleteDoc(doc(db, "chats", d.id))
        );
        await Promise.all(deletePromises);

    } catch (e) {
        console.error("Firestore Clear Error:", e);
    }

    // Reload to cleanly reset all in-memory state
    location.reload();
}

// Export db for direct usage
export { db };
