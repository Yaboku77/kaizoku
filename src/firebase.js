// ─────────────────────────────────────────────────────────────────────────────
//  KAIZOKU STREAM — Firebase Config
//  ➡  Replace every value below with YOUR Firebase project credentials.
//
//  How to get them:
//  1. Go to https://console.firebase.google.com
//  2. Select (or create) your project
//  3. Click ⚙ Project Settings → "Your apps" → Web app (</>)
//  4. Copy the firebaseConfig object and paste the values below
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

// Auth — uses AsyncStorage so sessions persist across app restarts
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Firestore database
export const db = getFirestore(app);

export default app;
