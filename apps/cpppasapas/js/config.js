// ==========================================================
// config.js — Firebase settings
//
// These values come from the Firebase console
// (Project settings → Your apps → Web app → "firebaseConfig").
// They are NOT secret: every web app shows them to the browser.
// The real protection is in firestore.rules.
//
// While apiKey is empty, the app runs in "MODE LOCAL":
// no login, progress saved only in this browser. Handy for testing.
// ==========================================================

export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// Firebase JavaScript SDK version (loaded from Google's CDN).
export const FIREBASE_VERSION = '12.19.0';

// Emails allowed to see the anonymous "hardest notions" stats and error reports.
// Must match the list in firestore.rules.
export const ADMIN_EMAILS = [];
