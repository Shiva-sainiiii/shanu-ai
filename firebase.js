// ==========================================
// Shanu AI - Firebase Configuration & Helpers
// Developer: Shiva Saini
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
    doc
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

// 1. Firebase Config (Tera project details)
const firebaseConfig = {
    apiKey: "AIzaSyCBAQgLhVaNcH1YS_qldqKTJ9Kg-JO9A74",
    authDomain: "shanu-ai.firebaseapp.com",
    projectId: "shanu-ai",
    storageBucket: "shanu-ai.firebasestorage.app",
    messagingSenderId: "225114447873",
    appId: "1:225114447873:web:408763c5b259506506a000"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Session ID logic (Unique for every user)
let sessionId = localStorage.getItem("shanu_session_id");
if (!sessionId) {
    sessionId = "session_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("shanu_session_id", sessionId);
}

// ------------------------------------------
// Exported Helper Functions
// ------------------------------------------

/**
 * Firestore me message save karne ke liye
 */
export async function saveMessageToDB(role, content) {
    try {
        await addDoc(collection(db, "chats"), {
            sessionId: sessionId,
            role: role,
            content: content,
            timestamp: new Date()
        });
    } catch (e) {
        console.error("Firestore Save Error:", e);
    }
}

/**
 * Purani chat history load karne ke liye
 */
export async function loadHistoryFromDB(limitCount = 20) {
    try {
        const q = query(
            collection(db, "chats"),
            where("sessionId", "==", sessionId),
            orderBy("timestamp", "asc"), // IMP: Console me jaakar Index create karna padega
            limit(limitCount)
        );

        const snapshot = await getDocs(q);
        let messages = [];
        snapshot.forEach((doc) => {
            messages.push(doc.data());
        });
        return messages;
    } catch (e) {
        console.error("Firestore Load Error:", e);
        // Agar Index nahi bana hoga toh error aayega, tab tak empty array bhej rahe hain
        return [];
    }
}

/**
 * Poori chat delete karne ke liye
 */
export async function clearSessionDB() {
    try {
        const q = query(
            collection(db, "chats"),
            where("sessionId", "==", sessionId)
        );
        const snapshot = await getDocs(q);
        
        // Ek-ek karke saare messages delete karna (Firestore limitation)
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "chats", d.id)));
        await Promise.all(deletePromises);
        
        // Session ID reset kar dete hain taaki fresh start ho
        const newId = "session_" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("shanu_session_id", newId);
        location.reload(); // Page reload taaki state clear ho jaye
        
    } catch (e) {
        console.error("Firestore Clear Error:", e);
    }
}

// Database instance export (In case specific needs)
export { db };
