/**
 * Firebase Client Initialization & Module Exporter
 * Supports live cloud credentials, analytics, emulator auto-detection, and offline persistence.
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup, 
  GoogleAuthProvider, 
  signInAnonymously,
  signOut,
  connectAuthEmulator 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp, 
  connectFirestoreEmulator,
  enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject, 
  connectStorageEmulator 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { 
  getAnalytics, 
  isSupported 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";

import { firebaseConfig, isConfigured } from "../../firebase-config.js";

let app = null;
let auth = null;
let db = null;
let storage = null;
let analytics = null;
let emulatorsConnected = false;

export function getFirebaseInstance() {
  if (!app) {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    // Initialize Analytics if supported in the current environment
    try {
      isSupported().then((supported) => {
        if (supported && app) {
          analytics = getAnalytics(app);
        }
      }).catch(() => {});
    } catch (_) {}

    // Enable offline persistence
    try {
      enableIndexedDbPersistence(db).catch(() => {});
    } catch (_) {}

    // Auto-connect to emulators if enabled
    const useEmulator = Boolean(window.__USE_FIREBASE_EMULATORS__) || 
      (window.location.hostname === 'localhost' && window.location.port === '5000' && Boolean(window.__FORCE_EMULATOR__));

    if (useEmulator && !emulatorsConnected) {
      try {
        connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
        connectFirestoreEmulator(db, "localhost", 8080);
        connectStorageEmulator(storage, "localhost", 9199);
        emulatorsConnected = true;
        console.info("⚡ Connected to Firebase Local Emulator Suite");
      } catch (e) {
        console.warn("Could not connect to Firebase Emulators:", e.message);
      }
    }
  }

  return { app, auth, db, storage, analytics, isReady: isConfigured() };
}

export {
  auth,
  db,
  storage,
  analytics,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  GoogleAuthProvider,
  signOut,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
};
