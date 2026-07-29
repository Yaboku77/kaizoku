import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  reload,
} from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? { ...firebaseUser } : null);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Sign Up ──────────────────────────────────────────────────────────────
  const signUp = async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    // Force state refresh so UI gets latest user object
    setUser({ ...cred.user });
    return cred.user;
  };

  // ── Sign In ──────────────────────────────────────────────────────────────
  const signIn = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    setUser({ ...cred.user });
    return cred.user;
  };

  // ── Sign Out ─────────────────────────────────────────────────────────────
  const signOut = () => firebaseSignOut(auth);

  // ── Update Profile (name + photoURL) ─────────────────────────────────────
  // Call this after you've uploaded an avatar and got the download URL.
  const updateUserProfile = async ({ displayName, photoURL }) => {
    if (!auth.currentUser) return;
    await updateProfile(auth.currentUser, {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(photoURL     !== undefined ? { photoURL }     : {}),
    });
    // Firebase doesn't automatically re-emit onAuthStateChanged after updateProfile,
    // so we reload the user and force a state update.
    await reload(auth.currentUser);
    setUser({ ...auth.currentUser });
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, updateUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
