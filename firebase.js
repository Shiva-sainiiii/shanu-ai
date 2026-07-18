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
    getDoc,
    deleteDoc,
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    linkWithPopup,
    signInWithCredential,
    signOut,
    EmailAuthProvider,
    linkWithCredential,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    linkWithPhoneNumber,
    PhoneAuthProvider,
    updateProfile
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

const LS_HISTORIES_KEY  = "shanu_chat_histories";   // { [chatId]: message[] }
const LS_SESSIONS_KEY   = "shanu_chat_sessions";     // [{ chatId, title, updatedAt }] newest first
const LS_ACTIVE_KEY     = "shanu_active_chat_id";
const LS_MAX_MESSAGES   = 60;   // keep each chat's local cache bounded
const LS_MAX_SESSIONS   = 30;   // keep the sidebar list bounded

function getAllLocalHistories() {
    try {
        const raw = localStorage.getItem(LS_HISTORIES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        console.warn("LocalStorage read failed:", e.message);
        return {};
    }
}

function saveAllLocalHistories(all) {
    try {
        localStorage.setItem(LS_HISTORIES_KEY, JSON.stringify(all));
    } catch (e) {
        console.warn("LocalStorage write failed:", e.message);
    }
}

function getLocalHistory(chatId) {
    const all = getAllLocalHistories();
    return all[chatId] || [];
}

function saveLocalHistory(chatId, messages) {
    const all = getAllLocalHistories();
    all[chatId] = messages.slice(-LS_MAX_MESSAGES);
    saveAllLocalHistories(all);
}

function appendLocalMessage(chatId, role, content, meta = {}, seq = null) {
    const history = getLocalHistory(chatId);
    const entry = { role, content, timestamp: Date.now(), seq: seq ?? (history.length + 1) };
    if (meta.displayLabel) entry.displayLabel = meta.displayLabel;
    if (meta.questionText) entry.questionText = meta.questionText;
    if (meta.fileThumbs && meta.fileThumbs.some(u => u)) entry.fileThumbs = meta.fileThumbs;
    history.push(entry);
    saveLocalHistory(chatId, history);
}

function clearLocalHistory(chatId) {
    const all = getAllLocalHistories();
    delete all[chatId];
    saveAllLocalHistories(all);
}

// ---- Session metadata (the sidebar list) ----
function getLocalSessions() {
    try {
        const raw = localStorage.getItem(LS_SESSIONS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function upsertLocalSession(chatId, title) {
    const sessions = getLocalSessions().filter(s => s.chatId !== chatId);
    sessions.unshift({ chatId, title, updatedAt: Date.now() });
    saveLocalSessions(sessions.slice(0, LS_MAX_SESSIONS));
}

function saveLocalSessions(sessions) {
    try {
        localStorage.setItem(LS_SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) { /* ignore */ }
}

function removeLocalSession(chatId) {
    saveLocalSessions(getLocalSessions().filter(s => s.chatId !== chatId));
}

// ---- Active chat pointer ----
function makeChatId() {
    return "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

export function getActiveChatId() {
    let id = localStorage.getItem(LS_ACTIVE_KEY);
    if (!id) {
        id = makeChatId();
        localStorage.setItem(LS_ACTIVE_KEY, id);
    }
    return id;
}

function setActiveChatId(id) {
    localStorage.setItem(LS_ACTIVE_KEY, id);
}

/**
 * Switch to a brand new, empty chat thread. Doesn't touch old data —
 * the previous chat stays saved and reachable from the sidebar.
 */
export function startNewChatSession() {
    const id = makeChatId();
    setActiveChatId(id);
    return id;
}

/** Point the active chat at an existing thread (user tapped it in the sidebar). */
export function switchActiveChatId(chatId) {
    setActiveChatId(chatId);
}

// ==========================================
// Auth Helpers
// ==========================================

const googleProvider = new GoogleAuthProvider();

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
 * Start Google sign-in. Optional — the app works fully without this.
 *
 * If the current session is anonymous (the default, no-signup state),
 * this LINKS the Google account to the existing anonymous user instead
 * of replacing it, so every chat already saved on this device stays
 * attached to the same uid and carries over rather than disappearing.
 *
 * Uses a popup, not a redirect. Redirect requires a `/__/auth/handler`
 * page that only exists on the default *.firebaseapp.com authDomain —
 * pointing authDomain at a custom domain (to dodge mobile Chrome's
 * storage-partitioning bug) breaks redirect entirely since that path
 * 404s on Vercel. Popup sidesteps both problems: no persisted
 * cross-navigation state, no dependency on a hosted handler page.
 *
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
export async function signInWithGoogle() {
    try {
        if (auth.currentUser?.isAnonymous) {
            await linkWithPopup(auth.currentUser, googleProvider);
        } else {
            await signInWithPopup(auth, googleProvider);
        }
        await syncProviderProfileToUser();
        return { success: true };
    } catch (e) {
        if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") {
            return { success: false, reason: "cancelled" };
        }
        if (e.code === "auth/credential-already-in-use") {
            // This Google account is already tied to a DIFFERENT existing
            // Firebase user (e.g. linked from another device first). Sign
            // into that original account instead of failing silently —
            // the user lands on their real history rather than nothing.
            try {
                const cred = GoogleAuthProvider.credentialFromError(e);
                if (cred) await signInWithCredential(auth, cred);
                await syncProviderProfileToUser();
                return { success: true };
            } catch (inner) {
                console.warn("Fallback sign-in after link conflict failed:", inner.message);
                return { success: false, reason: "conflict" };
            }
        }
        if (e.code === "auth/popup-blocked") {
            return { success: false, reason: "blocked" };
        }
        console.error("Google sign-in error:", e.code, e.message);
        return { success: false, reason: "error" };
    }
}

/**
 * Sign out of Google and drop back into a fresh anonymous session so the
 * app stays usable — signing out is never a dead end.
 */
export async function signOutUser() {
    try {
        await signOut(auth);
    } catch (e) {
        console.error("Sign-out error:", e.message);
    } finally {
        await signInAnonymously(auth);
    }
}

/** Human-readable messages for the auth error codes users actually hit. */
function mapAuthError(code) {
    const map = {
        "auth/invalid-email":         "That email doesn't look right.",
        "auth/weak-password":         "Password should be at least 6 characters.",
        "auth/wrong-password":        "Wrong password.",
        "auth/invalid-credential":    "Email or password is incorrect.",
        "auth/user-not-found":        "No account found with that email.",
        "auth/too-many-requests":     "Too many attempts — try again in a bit.",
        "auth/invalid-phone-number":  "That phone number doesn't look right. Include country code, e.g. +91...",
        "auth/invalid-verification-code": "Wrong OTP code.",
        "auth/code-expired":          "OTP expired — request a new one.",
        "auth/quota-exceeded":        "SMS limit reached for today — try again tomorrow.",
        "auth/network-request-failed": "Network error — check your connection."
    };
    return map[code] || "Something went wrong — try again.";
}

/**
 * Continue with email + password. One button, smart behind the scenes:
 *  - Anonymous session -> links this email to the existing uid (keeps
 *    all current chats) unless that email is already a real account,
 *    in which case it logs into that existing account instead.
 *  - No anonymous session -> tries to create an account, falls back to
 *    signing in if one already exists.
 */
export async function continueWithEmail(email, password) {
    try {
        if (auth.currentUser?.isAnonymous) {
            const cred = EmailAuthProvider.credential(email, password);
            await linkWithCredential(auth.currentUser, cred);
            return { success: true };
        }
        await createUserWithEmailAndPassword(auth, email, password);
        return { success: true };
    } catch (e) {
        if (e.code === "auth/email-already-in-use") {
            try {
                await signInWithEmailAndPassword(auth, email, password);
                return { success: true };
            } catch (inner) {
                return { success: false, reason: mapAuthError(inner.code) };
            }
        }
        return { success: false, reason: mapAuthError(e.code) };
    }
}

/**
 * Create (once) an invisible reCAPTCHA bound to a DOM element — required
 * by Firebase before it will send an SMS. Call once, reuse the instance.
 */
export function createRecaptchaVerifier(elementId) {
    return new RecaptchaVerifier(auth, elementId, { size: "invisible" });
}

/**
 * Send an OTP to a phone number (E.164 format, e.g. +919876543210).
 * Returns the confirmationResult needed by verifyPhoneOTP — hang onto it.
 * Free-tier Firebase caps this at 10 SMS/day project-wide.
 */
export async function sendPhoneOTP(phoneNumber, verifier) {
    try {
        const confirmationResult = auth.currentUser?.isAnonymous
            ? await linkWithPhoneNumber(auth.currentUser, phoneNumber, verifier)
            : await signInWithPhoneNumber(auth, phoneNumber, verifier);
        return { success: true, confirmationResult };
    } catch (e) {
        return { success: false, reason: mapAuthError(e.code) };
    }
}

/** Verify the OTP code the user typed in, completing phone sign-in/link. */
export async function verifyPhoneOTP(confirmationResult, code) {
    try {
        await confirmationResult.confirm(code);
        return { success: true };
    } catch (e) {
        if (e.code === "auth/credential-already-in-use") {
            // This phone number already belongs to a different existing
            // account — sign into that one instead of a dead-end error.
            try {
                const cred = PhoneAuthProvider.credentialFromError(e);
                if (cred) await signInWithCredential(auth, cred);
                return { success: true };
            } catch (inner) {
                return { success: false, reason: mapAuthError(inner.code) };
            }
        }
        return { success: false, reason: mapAuthError(e.code) };
    }
}

/** Lightweight profile snapshot for rendering the sidebar avatar/name. */
export function getUserProfile() {
    const u = auth.currentUser;
    if (!u || u.isAnonymous) {
        return { isAnonymous: true, displayName: null, photoURL: null, email: null, phoneNumber: null };
    }
    // When a Google account gets LINKED to an existing anonymous user,
    // Firebase doesn't auto-copy the provider's name/photo to the
    // top-level user object — it only lives in providerData. Fall back
    // to it here so the UI shows the real name/photo either way.
    const provider = u.providerData?.[0];
    return {
        isAnonymous: false,
        displayName: u.displayName || provider?.displayName || null,
        photoURL:    u.photoURL    || provider?.photoURL    || null,
        email:       u.email       || provider?.email       || null,
        phoneNumber: u.phoneNumber || provider?.phoneNumber || null
    };
}

/**
 * Copies the sign-in provider's name/photo up to the main user profile,
 * so auth.currentUser.displayName/photoURL are correct everywhere (not
 * just through the providerData fallback above). Cheap, safe to call
 * after every sign-in — no-ops if there's nothing new to copy.
 */
async function syncProviderProfileToUser() {
    const u = auth.currentUser;
    if (!u) return;
    const provider = u.providerData?.[0];
    if (!provider) return;
    const needsName  = !u.displayName && provider.displayName;
    const needsPhoto = !u.photoURL && provider.photoURL;
    if (needsName || needsPhoto) {
        try {
            await updateProfile(u, {
                displayName: u.displayName || provider.displayName || undefined,
                photoURL:    u.photoURL    || provider.photoURL    || undefined
            });
        } catch (e) {
            console.warn("Profile sync failed (non-critical):", e.message);
        }
    }
}

/** Let the user set their own display name (works for any sign-in method). */
export async function updateDisplayName(name) {
    try {
        await updateProfile(auth.currentUser, { displayName: name });
        return { success: true };
    } catch (e) {
        return { success: false, reason: "Naam save nahi ho paya, try again." };
    }
}

/**
 * Save a custom profile photo. Stored in Firestore (not Firebase Auth's
 * photoURL, which isn't meant for inline image data) as a small,
 * pre-compressed base64 JPEG — the caller is expected to resize/compress
 * client-side before calling this (keeps it well under Firestore's 1MB
 * document limit and fast to load).
 */
export async function updateProfilePhoto(dataUrl) {
    try {
        const userId = getCurrentUserId();
        await setDoc(doc(db, "userProfiles", userId), {
            photoDataUrl: dataUrl,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return { success: true };
    } catch (e) {
        console.error("Profile photo save error:", e);
        return { success: false, reason: "Photo save nahi ho payi, try again." };
    }
}

/** Fetch the custom Firestore-stored profile photo, if the user set one. */
export async function getCustomProfilePhoto() {
    try {
        const userId = getCurrentUserId();
        const snap = await getDoc(doc(db, "userProfiles", userId));
        return snap.exists() ? (snap.data().photoDataUrl || null) : null;
    } catch (e) {
        console.warn("Custom photo fetch failed:", e.message);
        return null;
    }
}

/** Subscribe to auth/profile changes (e.g. to refresh the sidebar UI live). */
export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
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
 *   meta.questionText — the user's typed question alongside a file upload,
 *                       shown as its own bubble (matches the live send flow,
 *                       where the file card and the question render separately)
 *   meta.fileThumbs   — array of Cloudinary URLs for attached images, so
 *                       thumbnails can be restored after a refresh
 */
export async function saveMessageToDB(role, content, meta = {}) {
    const chatId = getActiveChatId();
    const seq = ++localSeqCounter;

    // ── Write-through: localStorage first (instant, never fails silently) ──
    appendLocalMessage(chatId, role, content, meta, seq);

    // Title the session after the first user message (only set once)
    const existingMeta = getLocalSessions().find(s => s.chatId === chatId);
    const title = existingMeta?.title || (role === "user" ? content.slice(0, 60) : "New chat");
    upsertLocalSession(chatId, title);

    try {
        const userId    = getCurrentUserId();
        const safeContent = content.length > 3500
            ? content.slice(0, 3500) + "\n...[truncated]"
            : content;

        const docData = {
            sessionId: userId,          // Strict per-user isolation
            chatId,                      // Which conversation thread this belongs to
            role,
            content:   safeContent,
            seq,                         // Tie-breaker for stable ordering
            timestamp: serverTimestamp() // Server-side timestamp — no clock skew
        };
        if (meta.displayLabel) docData.displayLabel = meta.displayLabel;
        if (meta.questionText) docData.questionText = meta.questionText;
        if (meta.fileThumbs && meta.fileThumbs.some(u => u)) docData.fileThumbs = meta.fileThumbs;

        await addDoc(collection(db, "chats"), docData);

        // Upsert the session doc — one per chatId, powers the sidebar list
        // across devices. merge:true so we never clobber an existing title.
        await setDoc(doc(db, "chatSessions", chatId), {
            sessionId: userId,
            chatId,
            title,
            updatedAt: serverTimestamp()
        }, { merge: true });

    } catch (e) {
        console.warn("Firestore Save Warning (localStorage backup still saved):", e.message);
    }
}

/**
 * Load ordered chat history for the current authenticated user.
 * Uses composite index: (sessionId, timestamp ASC).
 */
export async function loadHistoryFromDB(chatId, limitCount = 60) {
    try {
        const userId = getCurrentUserId();

        const q = query(
            collection(db, "chats"),
            where("sessionId", "==", userId),   // Strict userId filter — no mixed chats
            where("chatId", "==", chatId),       // Only this conversation thread
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
            // cache for this chatId. Keep seq/displayLabel/questionText/
            // fileThumbs — dropping them here previously meant every reload
            // after this one lost the extra fields even though Firestore
            // still had them.
            saveLocalHistory(chatId, messages.map(m => ({
                role:         m.role,
                content:      m.content,
                timestamp:    Date.now(),
                seq:          m.seq,
                displayLabel: m.displayLabel,
                questionText: m.questionText,
                fileThumbs:   m.fileThumbs
            })));
            return messages;
        }

        // Firestore reachable but empty (new chat, or index just built) —
        // fall back to local cache in case it has anything Firestore missed
        return getLocalHistory(chatId);

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
        return getLocalHistory(chatId);
    }
}

/**
 * List this user's chat threads for the sidebar, newest first.
 * Falls back to the local session cache if Firestore is unreachable.
 */
export async function listChatSessions(limitCount = 30) {
    try {
        const userId = getCurrentUserId();
        const q = query(
            collection(db, "chatSessions"),
            where("sessionId", "==", userId),
            orderBy("updatedAt", "desc"),
            limit(limitCount)
        );
        const snapshot = await getDocs(q);
        const sessions = [];
        snapshot.forEach(d => sessions.push(d.data()));

        if (sessions.length > 0) {
            saveLocalSessions(sessions.map(s => ({
                chatId: s.chatId, title: s.title, updatedAt: Date.now()
            })));
            return sessions;
        }
        return getLocalSessions();
    } catch (e) {
        if (e.code === "failed-precondition" || e.message?.includes("index")) {
            console.warn(
                "⚠️ Firestore composite index missing for chatSessions.\n" +
                "Click the link in the error above to auto-create it (one-time)."
            );
        } else {
            console.warn("Session list load failed, using local cache:", e.message);
        }
        return getLocalSessions();
    }
}

/** Instant, synchronous read of the cached session list (for first paint). */
export function listChatSessionsSync() {
    return getLocalSessions();
}

/** Delete one chat thread (all its messages + its sidebar entry). */
export async function deleteChatSession(chatId) {
    clearLocalHistory(chatId);
    removeLocalSession(chatId);
    try {
        const userId = getCurrentUserId();
        const q = query(
            collection(db, "chats"),
            where("sessionId", "==", userId),
            where("chatId", "==", chatId)
        );
        const snapshot = await getDocs(q);
        const deletions = snapshot.docs.map(d => deleteDoc(doc(db, "chats", d.id)));
        deletions.push(deleteDoc(doc(db, "chatSessions", chatId)));
        await Promise.all(deletions);
    } catch (e) {
        console.error("Firestore session delete error:", e);
    }
}

/**
 * Instant-load helper: returns local cache synchronously (no await needed).
 * Use this to render history immediately on page load, before Firestore
 * has even started its round-trip.
 */
export function loadLocalHistorySync(chatId) {
    return getLocalHistory(chatId);
}

/**
 * Delete all messages for the current user and reload the app.
 */
/**
 * Delete ALL chat threads for the current user (nuclear option — this is
 * the "Clear all chat history" action, distinct from deleteChatSession()
 * which removes just one thread from the sidebar).
 */
export async function clearSessionDB() {
    try { localStorage.removeItem(LS_HISTORIES_KEY); } catch (_) {}
    try { localStorage.removeItem(LS_SESSIONS_KEY); } catch (_) {}
    try {
        const userId = getCurrentUserId();

        const msgQ = query(collection(db, "chats"), where("sessionId", "==", userId));
        const msgSnap = await getDocs(msgQ);
        const msgDeletions = msgSnap.docs.map(d => deleteDoc(doc(db, "chats", d.id)));

        const sessQ = query(collection(db, "chatSessions"), where("sessionId", "==", userId));
        const sessSnap = await getDocs(sessQ);
        const sessDeletions = sessSnap.docs.map(d => deleteDoc(doc(db, "chatSessions", d.id)));

        await Promise.all([...msgDeletions, ...sessDeletions]);
    } catch (e) {
        console.error("Firestore Clear Error:", e);
    } finally {
        startNewChatSession();
        location.reload();
    }
}

/**
 * Log a thumbs up/down on a reply. Fire-and-forget — never blocks the UI,
 * never throws into the caller. Just a signal for you to review later in
 * the Firestore console under the "feedback" collection.
 */
export async function logFeedback(chatId, messageSnippet, rating) {
    try {
        const userId = getCurrentUserId();
        await addDoc(collection(db, "feedback"), {
            sessionId: userId,
            chatId,
            messageSnippet: (messageSnippet || "").slice(0, 300),
            rating, // "up" | "down"
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.warn("Feedback log failed (non-critical):", e.message);
    }
}

export { db, auth };
