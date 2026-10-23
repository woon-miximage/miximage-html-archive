/**
 * Authentication Service for MIX-IMAGE HTML Archive
 * Handles Firebase Authentication, User Roles, and Session State
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

export function initAuth() {
  const { auth, db } = getFirebaseInstance();
  if (!auth) return;

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          currentUserProfile = userSnap.data();
        } else {
          // Initialize new user profile document
          currentUserProfile = {
            uid: user.uid,
            email: user.email || (user.isAnonymous ? "guest@miximage.app" : ""),
            displayName: user.displayName || (user.isAnonymous ? "Guest Creator" : user.email?.split('@')[0]) || "User",
            photoURL: user.photoURL || "",
            role: "editor", // default role
            createdAt: serverTimestamp()
          };
          await setDoc(userRef, currentUserProfile, { merge: true });
        }
      } catch (err) {
        console.warn("Could not load/create user profile:", err);
        currentUserProfile = {
          uid: user.uid,
          email: user.email || "guest@miximage.app",
          displayName: user.displayName || "User",
          role: "editor"
        };
      }
    } else {
      currentUserProfile = null;
    }
    notifyAuthListeners();
  });
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
  const { auth } = getFirebaseInstance();
  return signOut(auth);
}

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentUserProfile() {
  return currentUserProfile;
}

export function isAdminUser() {
  return currentUserProfile?.role === 'admin';
}
