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
// LocalStorage Backup Layer
// Purpose: Instant-load cache that mirrors Firestore.
//   - Every save writes to localStorage too (write-through)
//   - On load, localStorage renders INSTANTLY while Firestore
//     is confirmed/merged in the background — no more blank
//     screen while waiting on network + auth + index
//   - If Firestore is ever unreachable (index missing, offline,
//     rules issue), localStorage still has the real history
// ==========================================

const LS_KEY = "shanu_chat_history";
const LS_MAX_MESSAGES = 60; // keep local cache bounded

function getLocalHistory() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.warn("LocalStorage read failed:", e.message);
        return [];
    }
}

function saveLocalHistory(messages) {
    try {
        const trimmed = messages.slice(-LS_MAX_MESSAGES);
        localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
    } catch (e) {
        // Likely quota exceeded — drop oldest half and retry once
        console.warn("LocalStorage write failed, trimming:", e.message);
        try {
            const half = messages.slice(-Math.floor(LS_MAX_MESSAGES / 2));
            localStorage.setItem(LS_KEY, JSON.stringify(half));
        } catch (_) { /* give up silently — Firestore is still the source of truth */ }
    }
}

function appendLocalMessage(role, content, meta = {}, seq = null) {
    const history = getLocalHistory();
    const entry = { role, content, timestamp: Date.now(), seq: seq ?? (history.length + 1) };
    if (meta.displayLabel) entry.displayLabel = meta.displayLabel;
    if (meta.fileThumbs && meta.fileThumbs.some(u => u)) entry.fileThumbs = meta.fileThumbs;
    history.push(entry);
    saveLocalHistory(history);
}

function clearLocalHistory() {
    try { localStorage.removeItem(LS_KEY); } catch (_) { /* ignore */ }
}

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

// ── Monotonic per-tab counter ──
//    serverTimestamp() only resolves once Firestore's write actually
//    commits, so two messages saved back-to-back (e.g. a user message
//    immediately followed by the assistant's reply) can occasionally
//    commit in a different order than they were sent, especially over a
//    slow connection. orderBy("timestamp") then sorts them wrong and
//    that wrong order gets written back into localStorage too, visibly
//    scrambling the whole thread on the next reload.
//    A simple incrementing counter recorded at save-time removes the
//    ambiguity — it always reflects call order within this tab/session,
//    regardless of network timing.
let localSeqCounter = 0;

/**
 * Save a single message to Firestore under the current user's ID.
 * Includes serverTimestamp for cross-device ordering, plus a local
 * monotonic seq as a tie-breaker so same-session ordering never scrambles.
 *
 * @param {string} role
 * @param {string} content - full content (what the AI/history should see)
 * @param {object} [meta] - optional extras:
 *   meta.displayLabel — shorter text to actually render in the chat bubble
 *                       on history replay (falls back to `content` if omitted)
 *   meta.fileThumbs   — array of Cloudinary URLs for attached images, so
 *                       thumbnails can be restored after a refresh
 */
export async function saveMessageToDB(role, content, meta = {}) {
    const seq = ++localSeqCounter;

    // ── Write-through: localStorage first (instant, never fails silently) ──
    appendLocalMessage(role, content, meta, seq);

    try {
        const userId    = getCurrentUserId();
        const safeContent = content.length > 3500
            ? content.slice(0, 3500) + "\n...[truncated]"
            : content;

        const docData = {
            sessionId: userId,          // Strict per-user isolation
            role,
            content:   safeContent,
            seq,                         // Tie-breaker for stable ordering
            timestamp: serverTimestamp() // Server-side timestamp — no clock skew
        };
        if (meta.displayLabel) docData.displayLabel = meta.displayLabel;
        if (meta.fileThumbs && meta.fileThumbs.some(u => u)) docData.fileThumbs = meta.fileThumbs;

        await addDoc(collection(db, "chats"), docData);
    } catch (e) {
        console.warn("Firestore Save Warning (localStorage backup still saved):", e.message);
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

        // ── Stable tie-break on seq ──
        //    serverTimestamp() resolves at commit time, so two messages
        //    saved in quick succession (a user turn immediately followed
        //    by the assistant's reply) can occasionally commit out of
        //    send-order, especially on a slow connection. orderBy alone
        //    then returns them scrambled. seq was recorded client-side at
        //    the moment each save was *called*, so re-sorting by it here
        //    restores the true conversational order before anything is
        //    rendered or written back to localStorage.
        messages.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

        if (messages.length > 0) {
            // Firestore is source of truth when reachable — refresh local
            // cache. Keep seq/displayLabel/fileThumbs — dropping them here
            // previously meant every reload after this one lost the extra
            // fields even though Firestore still had them.
            saveLocalHistory(messages.map(m => ({
                role:         m.role,
                content:      m.content,
                timestamp:    Date.now(),
                seq:          m.seq,
                displayLabel: m.displayLabel,
                fileThumbs:   m.fileThumbs
            })));
            return messages;
        }

        // Firestore reachable but empty (new user, or index just built) —
        // fall back to local cache in case it has anything Firestore missed
        return getLocalHistory();

    } catch (e) {
        if (e.code === "failed-precondition" || e.message?.includes("index")) {
            console.warn(
                "⚠️ Firestore composite index missing.\n" +
                "Click the link in the error above to auto-create it.\n" +
                "Takes ~2 mins. One-time setup only.\n" +
                "Using localStorage backup in the meantime."
            );
        } else {
            console.error("Firestore Load Error (using localStorage backup):", e);
        }
        return getLocalHistory();
    }
}

/**
 * Instant-load helper: returns local cache synchronously (no await needed).
 * Use this to render history immediately on page load, before Firestore
 * has even started its round-trip.
 */
export function loadLocalHistorySync() {
    return getLocalHistory();
}

/**
 * Delete all messages for the current user and reload the app.
 */
export async function clearSessionDB() {
    clearLocalHistory();
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
