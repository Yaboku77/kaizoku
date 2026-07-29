import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Animated, Easing, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';

// ─── Firebase error → human-readable message ─────────────────────────────────
function parseFirebaseError(error) {
  const code = error?.code || '';
  const map = {
    'auth/invalid-email':            'Please enter a valid email address.',
    'auth/user-not-found':           'No account found with this email.',
    'auth/wrong-password':           'Incorrect password. Please try again.',
    'auth/email-already-in-use':     'This email is already registered. Sign in instead.',
    'auth/weak-password':            'Password must be at least 6 characters.',
    'auth/too-many-requests':        'Too many attempts. Please try again later.',
    'auth/network-request-failed':   'Network error. Check your connection.',
    'auth/invalid-credential':       'Invalid credentials. Check your email and password.',
  };
  return map[code] || error?.message || 'Something went wrong. Please try again.';
}

// ─── Animated Tab Indicator ───────────────────────────────────────────────────
function TabSelector({ tab, onSwitch }) {
  const anim = useRef(new Animated.Value(tab === 'signin' ? 0 : 1)).current;

  const switchTo = (t) => {
    Animated.timing(anim, {
      toValue: t === 'signin' ? 0 : 1,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    onSwitch(t);
  };

  const indicatorLeft = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '50%'],
  });

  return (
    <View style={TS.container}>
      <Animated.View style={[TS.indicator, { left: indicatorLeft }]} />
      <TouchableOpacity style={TS.btn} onPress={() => switchTo('signin')} activeOpacity={0.7}>
        <Text style={[TS.label, tab === 'signin' && TS.activeLabel]}>Sign In</Text>
      </TouchableOpacity>
      <TouchableOpacity style={TS.btn} onPress={() => switchTo('signup')} activeOpacity={0.7}>
        <Text style={[TS.label, tab === 'signup' && TS.activeLabel]}>Sign Up</Text>
      </TouchableOpacity>
    </View>
  );
}

const TS = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 4, position: 'relative', marginBottom: 32 },
  indicator: { position: 'absolute', top: 4, bottom: 4, width: '50%', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 10, zIndex: 1 },
  label: { color: '#6b7280', fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  activeLabel: { color: '#ffffff' },
});

// ─── Text Input Field ─────────────────────────────────────────────────────────
function AuthInput({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize }) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden]   = useState(secureTextEntry);

  return (
    <View style={[AI.wrap, focused && AI.wrapFocused]}>
      <Ionicons name={icon} size={18} color={focused ? '#a78bfa' : '#4b5563'} style={AI.icon} />
      <TextInput
        style={AI.input}
        placeholder={placeholder}
        placeholderTextColor="#374151"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={hidden}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'none'}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {secureTextEntry && (
        <TouchableOpacity onPress={() => setHidden(h => !h)} style={AI.eye}>
          <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color="#4b5563" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const AI = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14, paddingHorizontal: 16, marginBottom: 14, height: 54,
  },
  wrapFocused: { borderColor: 'rgba(167,139,250,0.4)', backgroundColor: 'rgba(167,139,250,0.04)' },
  icon: { marginRight: 12 },
  input: { flex: 1, color: '#fff', fontSize: 15, letterSpacing: 0.2 },
  eye: { padding: 4 },
});

// ─── Main Auth Screen ─────────────────────────────────────────────────────────
export default function AuthScreen({ navigation }) {
  const { signIn, signUp } = useAuth();

  const [tab,         setTab]         = useState('signin');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [name,        setName]        = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const switchTab = (t) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setTab(t);
    setError('');
    setEmail('');
    setPassword('');
    setName('');
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (tab === 'signup' && !name.trim()) {
      setError('Please enter your display name.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (tab === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, name.trim());
      }
      // onAuthStateChanged in AuthContext updates user → AppNavigator shows Tabs
    } catch (e) {
      setError(parseFirebaseError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background gradient */}
      <LinearGradient
        colors={['#0d0d1a', '#050510', '#000000']}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative glows */}
      <View style={S.glowPurple} />
      <View style={S.glowBlue} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={S.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo / brand */}
            <View style={S.brand}>
              <View style={S.logoCircle}>
                <Ionicons name="play" size={28} color="#a78bfa" />
              </View>
              <Text style={S.appName}>KAIZOKU</Text>
              <Text style={S.tagline}>Stream anime, track your journey</Text>
            </View>

            {/* Card */}
            <View style={S.card}>
              <TabSelector tab={tab} onSwitch={switchTab} />

              <Animated.View style={{ opacity: fadeAnim }}>
                {tab === 'signup' && (
                  <AuthInput
                    icon="person-outline"
                    placeholder="Display name"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                )}

                <AuthInput
                  icon="mail-outline"
                  placeholder="Email address"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                />

                <AuthInput
                  icon="lock-closed-outline"
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                {/* Error */}
                {!!error && (
                  <View style={S.errBox}>
                    <Ionicons name="alert-circle-outline" size={15} color="#f87171" />
                    <Text style={S.errText}>{error}</Text>
                  </View>
                )}

                {/* Submit button */}
                <TouchableOpacity
                  style={S.submitBtn}
                  onPress={handleSubmit}
                  activeOpacity={0.85}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={['#7c3aed', '#6d28d9', '#5b21b6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={S.submitGradient}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={S.submitText}>{tab === 'signin' ? 'Sign In' : 'Create Account'}</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                {/* Switch link */}
                <TouchableOpacity onPress={() => switchTab(tab === 'signin' ? 'signup' : 'signin')} style={S.switchRow}>
                  <Text style={S.switchText}>
                    {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                    <Text style={S.switchLink}>
                      {tab === 'signin' ? 'Sign Up' : 'Sign In'}
                    </Text>
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>

            {/* Guest continue */}
            <TouchableOpacity onPress={() => navigation.replace('Tabs')} style={S.guestBtn}>
              <Text style={S.guestText}>Continue as Guest</Text>
              <Ionicons name="arrow-forward" size={14} color="#4b5563" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  glowPurple: {
    position: 'absolute', top: -80, left: -80,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(109,40,217,0.18)',
  },
  glowBlue: {
    position: 'absolute', bottom: 60, right: -60,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  brand: { alignItems: 'center', marginBottom: 36 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(109,40,217,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(167,139,250,0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  appName: {
    color: '#fff', fontSize: 28, fontWeight: '800',
    letterSpacing: 6, marginBottom: 6,
  },
  tagline: { color: '#4b5563', fontSize: 13, letterSpacing: 0.3 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 24, padding: 24,
    shadowColor: '#7c3aed',
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 10,
  },

  errBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 14,
  },
  errText: { color: '#f87171', fontSize: 13, flex: 1, lineHeight: 18 },

  submitBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  submitGradient: {
    height: 54, alignItems: 'center', justifyContent: 'center',
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  switchRow: { alignItems: 'center', marginTop: 20 },
  switchText: { color: '#4b5563', fontSize: 13 },
  switchLink: { color: '#a78bfa', fontWeight: '600' },

  guestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 24,
  },
  guestText: { color: '#4b5563', fontSize: 13 },
});
