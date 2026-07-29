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
  apiKey: "AIzaSyDkxxs1qJr0RtOpgfn9VU3PqsynPIR13hw",
  authDomain: "movies-f43ae.firebaseapp.com",
  databaseURL: "https://movies-f43ae.firebaseio.com",
  projectId: "movies-f43ae",
  storageBucket: "movies-f43ae.firebasestorage.app",
  messagingSenderId: "454522451037",
  appId: "1:454522451037:web:ecf9c486bd2e00aa3f89b4",
  measurementId: "G-GYMJGNJS2Z"
};

const app = initializeApp(firebaseConfig);

// Auth — uses AsyncStorage so sessions persist across app restarts
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Firestore database
export const db = getFirestore(app);

export default app;
