/**
 * MIX-IMAGE HTML Archive — Live Firebase Configuration
 * Configured for Project: miximagehtml
 */

export const firebaseConfig = {
  apiKey: "AIzaSyAsOyegeqS-gt2OuOt7E2eRE__vNbrGIRI",
  authDomain: "miximagehtml.firebaseapp.com",
  projectId: "miximagehtml",
  storageBucket: "miximagehtml.firebasestorage.app",
  messagingSenderId: "231489819918",
  appId: "1:231489819918:web:0de4529bd590cc2f1a735f",
  measurementId: "G-DP64LWBV4X"
};

export function isConfigured() {
  return true;
}

export function saveFirebaseConfig(newConfig) {
  if (!newConfig || !newConfig.projectId) {
    throw new Error("Invalid Firebase configuration object");
  }
  localStorage.setItem('miximage_firebase_config', JSON.stringify(newConfig));
  window.location.reload();
}

export function resetFirebaseConfig() {
  localStorage.removeItem('miximage_firebase_config');
  window.location.reload();
}
