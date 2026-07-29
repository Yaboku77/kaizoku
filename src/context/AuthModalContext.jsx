import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  Animated, ActivityIndicator, Platform, ScrollView,
  Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from './AuthContext';

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthModalContext = createContext(null);

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be inside <AuthModalProvider>');
  return ctx;
}

// ─── Firebase error → human readable ─────────────────────────────────────────
function parseError(error) {
  const map = {
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/user-not-found':         'No account found with this email.',
    'auth/wrong-password':         'Incorrect password. Try again.',
    'auth/email-already-in-use':   'Email already registered. Sign in instead.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/too-many-requests':      'Too many attempts. Try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/invalid-credential':     'Invalid credentials. Check email & password.',
  };
  return map[error?.code] || error?.message || 'Something went wrong.';
}

// ─── Text Input Field ─────────────────────────────────────────────────────────
function Field({ icon, placeholder, value, onChange, secure, keyboard, autoCapitalize, returnKeyType, onSubmitEditing, inputRef }) {
  const [focused, setFocused] = useState(false);
  const [hidden,  setHidden]  = useState(secure);
  return (
    <View style={[F.wrap, focused && F.focused]}>
      <Ionicons name={icon} size={17} color={focused ? '#a78bfa' : '#4b5563'} style={F.icon} />
      <TextInput
        ref={inputRef}
        style={F.input}
        placeholder={placeholder}
        placeholderTextColor="#374151"
        value={value}
        onChangeText={onChange}
        secureTextEntry={hidden}
        keyboardType={keyboard || 'default'}
        autoCapitalize={autoCapitalize || 'none'}
        autoCorrect={false}
        returnKeyType={returnKeyType || 'next'}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {secure && (
        <TouchableOpacity onPress={() => setHidden(h => !h)} style={F.eye} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={17} color="#4b5563" />
        </TouchableOpacity>
      )}
    </View>
  );
}
const F = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 13, paddingHorizontal: 14, height: 52, marginBottom: 12 },
  focused: { borderColor: 'rgba(167,139,250,0.5)', backgroundColor: 'rgba(167,139,250,0.06)' },
  icon:    { marginRight: 10 },
  input:   { flex: 1, color: '#fff', fontSize: 15 },
  eye:     { padding: 4 },
});

// ─── Auth Modal UI ────────────────────────────────────────────────────────────
function AuthModalUI({ visible, onClose }) {
  const { signIn, signUp } = useAuth();

  const [tab,      setTab]      = useState('signin');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [name,     setName]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // ── Keyboard-aware card position ─────────────────────────────────────────
  // On Android, we manually track keyboard height and shift the card up.
  // On iOS, KeyboardAvoidingView with 'padding' works perfectly.
  const cardTranslateY = useRef(new Animated.Value(0)).current;
  const fadeAnim       = useRef(new Animated.Value(0)).current;

  // Field refs for focus-chain
  const emailRef    = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef  = useRef(null);

  useEffect(() => {
    if (!visible) return;

    // Fade in when shown
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 220, useNativeDriver: true,
    }).start();

    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        const keyboardH = e.endCoordinates.height;
        Animated.spring(cardTranslateY, {
          toValue: -(keyboardH / 2),  // shift card up by half keyboard height
          useNativeDriver: true,
          bounciness: 0,
          speed: 20,
        }).start();
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        Animated.spring(cardTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 20,
        }).start();
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const handleClose = () => {
    Keyboard.dismiss();
    Animated.timing(fadeAnim, {
      toValue: 0, duration: 150, useNativeDriver: true,
    }).start(() => {
      setError(''); setEmail(''); setPassword(''); setConfirm(''); setName('');
      setTab('signin');
      onClose();
    });
  };

  const switchTab = (t) => {
    setTab(t);
    setError('');
    setEmail(''); setPassword(''); setConfirm(''); setName('');
    Keyboard.dismiss();
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !password.trim()) { setError('Please fill in all fields.'); return; }
    if (tab === 'signup') {
      if (!name.trim())         { setError('Please enter your display name.'); return; }
      if (password !== confirm) { setError('Passwords do not match.'); return; }
      if (password.length < 6)  { setError('Password must be at least 6 characters.'); return; }
    }
    setLoading(true); setError('');
    try {
      if (tab === 'signin') await signIn(email.trim(), password);
      else                  await signUp(email.trim(), password, name.trim());
      handleClose();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"      // we handle animation ourselves
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* ── Blurred dark overlay ── */}
      <BlurView
        tint="dark"
        intensity={70}
        experimentalBlurMethod="dimezisBlurView"   // Android blur
        style={StyleSheet.absoluteFill}
      />
      {/* Extra dim on top of blur for richness */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: fadeAnim }]} />

      {/* Tap outside to close */}
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      {/* ── Card container — shifts up with keyboard ── */}
      <View style={M.centerer} pointerEvents="box-none">
        <Animated.View
          style={[
            M.card,
            { opacity: fadeAnim, transform: [{ translateY: cardTranslateY }] },
          ]}
        >
          {/* Close */}
          <TouchableOpacity style={M.closeBtn} onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={20} color="#6b7280" />
          </TouchableOpacity>

          {/* Heading */}
          <View style={M.headingWrap}>
            <Text style={M.heading}>
              {tab === 'signin' ? 'Welcome back' : 'Create your account'}
            </Text>
            <Text style={M.subheading}>
              {tab === 'signin'
                ? 'Sign in to your Kaizoku account'
                : 'Sign up to get started'}
            </Text>
          </View>

          {/* Scrollable form so it's never hidden behind keyboard */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {tab === 'signup' && (
              <Field
                icon="person-outline"
                placeholder="Display name"
                value={name}
                onChange={setName}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            )}
            <Field
              inputRef={emailRef}
              icon="mail-outline"
              placeholder={tab === 'signin' ? 'Enter your email' : 'Choose an email'}
              value={email}
              onChange={setEmail}
              keyboard="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              inputRef={passwordRef}
              icon="lock-closed-outline"
              placeholder={tab === 'signin' ? 'Enter your password' : 'Choose a password'}
              value={password}
              onChange={setPassword}
              secure
              returnKeyType={tab === 'signup' ? 'next' : 'done'}
              onSubmitEditing={() => tab === 'signup' ? confirmRef.current?.focus() : handleSubmit()}
            />
            {tab === 'signup' && (
              <Field
                inputRef={confirmRef}
                icon="lock-closed-outline"
                placeholder="Re-enter your password"
                value={confirm}
                onChange={setConfirm}
                secure
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            )}

            {/* Error */}
            {!!error && (
              <View style={M.errRow}>
                <Ionicons name="alert-circle-outline" size={14} color="#f87171" />
                <Text style={M.errText}>{error}</Text>
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={M.submitWrap}
              onPress={handleSubmit}
              activeOpacity={0.87}
              disabled={loading}
            >
              <LinearGradient
                colors={['#7c3aed', '#5b21b6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={M.submitGrad}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={M.submitText}>{tab === 'signin' ? 'Sign in' : 'Sign up'}</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            {/* Switch tab */}
            <TouchableOpacity
              onPress={() => switchTab(tab === 'signin' ? 'signup' : 'signin')}
              style={M.switchRow}
            >
              <Text style={M.switchText}>
                {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <Text style={M.switchLink}>
                  {tab === 'signin' ? 'Sign up' : 'Sign in'}
                </Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const M = StyleSheet.create({
  centerer:    {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#0d0d0d',
    borderRadius: 26,
    padding: 24,
    paddingTop: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
    elevation: 30,
    position: 'relative',
    // Glass-like inner glow
    overflow: 'hidden',
  },
  closeBtn:    {
    position: 'absolute', top: 16, right: 16,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  headingWrap: { alignItems: 'center', marginBottom: 22, marginTop: 4 },
  heading:     { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.2, marginBottom: 5, textAlign: 'center' },
  subheading:  { color: '#6b7280', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  errRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: 10, padding: 10, marginBottom: 12 },
  errText:     { color: '#f87171', fontSize: 12.5, flex: 1, lineHeight: 17 },
  submitWrap:  { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  submitGrad:  { height: 54, alignItems: 'center', justifyContent: 'center' },
  submitText:  { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
  switchRow:   { alignItems: 'center', marginTop: 18, marginBottom: 4, paddingVertical: 4 },
  switchText:  { color: '#6b7280', fontSize: 13 },
  switchLink:  { color: '#a78bfa', fontWeight: '700' },
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthModalProvider({ children }) {
  const [visible, setVisible] = useState(false);

  const openAuthModal  = () => setVisible(true);
  const closeAuthModal = () => setVisible(false);

  return (
    <AuthModalContext.Provider value={{ openAuthModal, closeAuthModal }}>
      {children}
      <AuthModalUI visible={visible} onClose={closeAuthModal} />
    </AuthModalContext.Provider>
  );
}
