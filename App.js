import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import SplashScreen from './src/components/SplashScreen';
import { PlayerProvider, usePlayer } from './src/context/PlayerContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AuthModalProvider } from './src/context/AuthModalContext';
import GlobalPlayer from './src/screens/PlayerScreen';

import { useFonts, Shojumaru_400Regular } from '@expo-google-fonts/shojumaru';
import * as SplashScreenNative from 'expo-splash-screen';

SplashScreenNative.preventAutoHideAsync();

// ─── Bridge: injects Firebase user uid into PlayerContext so settings sync ───
function AuthPlayerBridge() {
  const { user }       = useAuth();
  const { setUserUid } = usePlayer();
  useEffect(() => {
    setUserUid(user?.uid || null);
  }, [user?.uid]);
  return null;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [fontsLoaded, fontError] = useFonts({
    Shojumaru: Shojumaru_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      const timer = setTimeout(async () => {
        setShowSplash(false);
        await SplashScreenNative.hideAsync();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AuthModalProvider>
            <PlayerProvider>
              {/* Syncs uid from auth into player context for cloud pref saving */}
              <AuthPlayerBridge />
              <StatusBar style="light" backgroundColor="#000000" translucent />
              <AppNavigator />
              <GlobalPlayer />
              <SplashScreen visible={showSplash} />
            </PlayerProvider>
          </AuthModalProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
