/**
 * MIX-IMAGE HTML Archive — Firebase Configuration
 * 
 * Replace the placeholder values with your Firebase Project credentials
 * obtained from the Firebase Console (Project Settings > General > Your apps).
 * 
 * In production or CI/CD, these can be injected via environment variables or
 * a hosting environment configuration.
 */

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/**
 * Checks whether the current configuration contains valid Firebase credentials.
 * @returns {boolean}
 */
export function isConfigured() {
  return (
    Boolean(firebaseConfig.apiKey) &&
    firebaseConfig.apiKey !== "YOUR_API_KEY" &&
    Boolean(firebaseConfig.projectId) &&
    firebaseConfig.projectId !== "YOUR_PROJECT_ID"
  );
}
