import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { getPlayerPrefs, savePlayerPrefs } from '../data/constants';
import { saveSettingsToCloud, getSettingsFromCloud } from '../api/firestore';

const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [playerState, setPlayerState] = useState({
    isActive: false,
    isMinimized: false,
    data: null,
  });

  const [prefs, setPrefs] = useState({
    speed: 1, quality: 'auto', subtitles: true,
    autoPlay: false, autoNext: true, autoSkip: false,
    ambientMode: false, miniplayer: true, audioBoost: 100, hideAdult: true,
  });

  // We need the user uid for cloud saves — read from AuthContext lazily to avoid circular deps
  // We store it via a setter called from outside (AuthContext calls setUserUid when user changes)
  const userUidRef = useRef(null);
  const [userUid, _setUserUid] = useState(null);
  const setUserUid = (uid) => {
    userUidRef.current = uid;
    _setUserUid(uid);
  };

  // Load prefs on mount (local first, then cloud if signed in)
  useEffect(() => {
    getPlayerPrefs().then(localPrefs => {
      setPrefs(prev => ({ ...prev, ...localPrefs }));
    });
  }, []);

  // When user signs in, fetch their cloud prefs and apply them
  useEffect(() => {
    if (!userUid) return;
    getSettingsFromCloud(userUid).then(cloudPrefs => {
      if (cloudPrefs) {
        setPrefs(prev => {
          const merged = { ...prev, ...cloudPrefs };
          savePlayerPrefs(merged); // keep local in sync
          return merged;
        });
      }
    });
  }, [userUid]);

  const updatePrefs = (newPrefs) => {
    setPrefs(prev => {
      const updated = { ...prev, ...newPrefs };
      savePlayerPrefs(updated); // local AsyncStorage
      if (userUidRef.current) {
        saveSettingsToCloud(userUidRef.current, updated).catch(() => {}); // cloud
      }
      return updated;
    });
  };

  const play = (data) => {
    setPlayerState({ isActive: true, isMinimized: false, data });
  };

  const minimize = () => {
    setPlayerState(prev => ({ ...prev, isMinimized: true }));
  };

  const maximize = () => {
    setPlayerState(prev => ({ ...prev, isMinimized: false }));
  };

  const close = () => {
    setPlayerState({ isActive: false, isMinimized: false, data: null });
  };

  return (
    <PlayerContext.Provider value={{ playerState, play, minimize, maximize, close, prefs, updatePrefs, setUserUid }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  return useContext(PlayerContext);
}
