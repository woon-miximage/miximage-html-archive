/**
 * Authentication Service for MIX-IMAGE HTML Archive
 * Handles Firebase Authentication, User Roles, PIN Code Login (1449), and Session State
 */

import {
  getFirebaseInstance,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  GoogleAuthProvider,
  signOut,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "./firebase-service.js";

const MASTER_PIN = "1449";
const PIN_STORAGE_KEY = "miximage_pin_auth";

let currentUser = null;
let currentUserProfile = null;
let authListeners = [];

export function subscribeAuth(callback) {
  authListeners.push(callback);
  if (currentUser !== undefined) {
    callback(currentUser, currentUserProfile);
  }
  return () => {
    authListeners = authListeners.filter(cb => cb !== callback);
  };
}

function notifyAuthListeners() {
  for (const listener of authListeners) {
    try {
      listener(currentUser, currentUserProfile);
    } catch (e) {
      console.error("Error in auth listener:", e);
    }
  }
}

export function isPinAuthenticated() {
  try {
    return sessionStorage.getItem(PIN_STORAGE_KEY) === MASTER_PIN;
  } catch (_) {
    return false;
  }
}

export function initAuth() {
  const { auth, db } = getFirebaseInstance();
  const hasPinSession = isPinAuthenticated();

  // If already authenticated by PIN in this session, restore immediately
  if (hasPinSession) {
    currentUserProfile = {
      uid: "owner-master",
      email: "owner@miximage.app",
      displayName: "ลูกพี่ (PIN Master)",
      role: "admin",
      isPinMaster: true
    };
  }

  if (!auth) {
    notifyAuthListeners();
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    const isPin = isPinAuthenticated();

    if (user) {
      if (isPin) {
        // Enforce Admin role for PIN session
        currentUserProfile = {
          uid: user.uid,
          email: user.email || "owner@miximage.app",
          displayName: "ลูกพี่ (PIN Master)",
          role: "admin",
          isPinMaster: true
        };
        try {
          await setDoc(doc(db, "users", user.uid), currentUserProfile, { merge: true });
        } catch (_) {}
      } else {
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            currentUserProfile = userSnap.data();
          } else {
            currentUserProfile = {
              uid: user.uid,
              email: user.email || (user.isAnonymous ? "guest@miximage.app" : ""),
              displayName: user.displayName || (user.isAnonymous ? "Guest Creator" : user.email?.split('@')[0]) || "User",
              photoURL: user.photoURL || "",
              role: "editor",
              createdAt: serverTimestamp()
            };
            await setDoc(userRef, currentUserProfile, { merge: true });
          }
        } catch (err) {
          currentUserProfile = {
            uid: user.uid,
            email: user.email || "user@miximage.app",
            displayName: user.displayName || "User",
            role: "editor"
          };
        }
      }
    } else {
      if (isPin) {
        currentUser = { uid: "owner-master", email: "owner@miximage.app", displayName: "ลูกพี่ (PIN Master)" };
        currentUserProfile = {
          uid: "owner-master",
          email: "owner@miximage.app",
          displayName: "ลูกพี่ (PIN Master)",
          role: "admin",
          isPinMaster: true
        };
      } else {
        currentUserProfile = null;
      }
    }
    notifyAuthListeners();
  });
}

/**
 * Log in using Master PIN Code (1449)
 * Instantly grants Admin privileges and signs into Firebase session.
 */
export async function loginWithPin(pin) {
  if (pin !== MASTER_PIN) {
    throw new Error("รหัส PIN ไม่ถูกต้อง โปรดลองอีกครั้ง");
  }

  sessionStorage.setItem(PIN_STORAGE_KEY, MASTER_PIN);
  const { auth, db } = getFirebaseInstance();

  let user = auth?.currentUser;
  if (!user && auth) {
    try {
      const cred = await signInAnonymously(auth);
      user = cred.user;
    } catch (e) {
      console.warn("Anonymous auth fallback:", e.message);
    }
  }

  currentUser = user || { uid: "owner-master", email: "owner@miximage.app", displayName: "ลูกพี่ (PIN Master)" };
  currentUserProfile = {
    uid: currentUser.uid,
    email: currentUser.email || "owner@miximage.app",
    displayName: "ลูกพี่ (PIN Master)",
    role: "admin",
    isPinMaster: true
  };

  if (db && user) {
    try {
      await setDoc(doc(db, "users", user.uid), currentUserProfile, { merge: true });
    } catch (_) {}
  }

  notifyAuthListeners();
  return currentUserProfile;
}

export async function loginWithEmail(email, password) {
  const { auth } = getFirebaseInstance();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email, password, displayName) {
  const { auth, db } = getFirebaseInstance();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const user = cred.user;
  const userRef = doc(db, "users", user.uid);
  const profile = {
    uid: user.uid,
    email: user.email,
    displayName: displayName || email.split('@')[0],
    role: "editor",
    createdAt: serverTimestamp()
  };
  await setDoc(userRef, profile);
  return user;
}

export async function loginWithGoogle() {
  const { auth } = getFirebaseInstance();
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function loginAnonymously() {
  const { auth } = getFirebaseInstance();
  return signInAnonymously(auth);
}

export async function logoutUser() {
  try {
    sessionStorage.removeItem(PIN_STORAGE_KEY);
  } catch (_) {}
  const { auth } = getFirebaseInstance();
  if (auth) return signOut(auth);
  currentUser = null;
  currentUserProfile = null;
  notifyAuthListeners();
}

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentUserProfile() {
  return currentUserProfile;
}

export function isAdminUser() {
  return currentUserProfile?.role === "admin" || isPinAuthenticated();
}
