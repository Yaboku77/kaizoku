import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  Dimensions, ActivityIndicator, StatusBar, Alert, Modal, BackHandler, TouchableWithoutFeedback,
  LayoutAnimation, UIManager, Platform, Switch, Animated, AppState, PanResponder
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedShimmer } from '../components/SharedComponents';
import { TMDB_API_KEY, saveToHistory, updateProgress, getPlayerPrefs, savePlayerPrefs, getList, saveToList, removeFromList } from '../data/constants';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { saveHistoryToCloud, updateProgressInCloud, saveListToCloud, removeFromListCloud, getReactionState, toggleReaction } from '../api/firestore';
import { fetchAniListCommentsPreview } from '../api/anilist';
import { scrapeSearch } from '../api/scrapers/search.scraper';
import { scrapeWatch } from '../api/scrapers/watch.scraper';
import { extractStreamUrl, extractVidstream } from '../api/extractors';
import CommentsSheet from './CommentsSheet';

// Safe PiP helpers — expo-pip requires a native build; guard so Expo Go never crashes
let enterNativePip = null;
let useIsInPip = () => ({ isInPipMode: false });
let setPipParams = null;
try {
  const ExpoPip = require('expo-pip');
  if (ExpoPip && ExpoPip.enterPipMode) enterNativePip = ExpoPip.enterPipMode;
  if (ExpoPip && ExpoPip.useIsInPip) useIsInPip = ExpoPip.useIsInPip;
  if (ExpoPip && ExpoPip.setPictureInPictureParams) setPipParams = ExpoPip.setPictureInPictureParams;
} catch (_) { /* native module not available in this build */ }

const safePip = (opts) => { try { enterNativePip && enterNativePip(opts); } catch (_) { } };
const safeSetPipParams = (opts) => { try { setPipParams && setPipParams(opts); } catch (_) { } };

const { width } = Dimensions.get('window');
const TMDB_KEY = TMDB_API_KEY || '3dfa4bae246f35044e56a6dcd3294e3f';

// Scraping runs locally on-device — no hosted proxy server needed
const EPISODES_PER_PAGE = 25;
// Preferred server order (from API: VidPlay-1, HD-1, Vidstream-2, VidCloud-1)
// Server preference order — names must match what anikoto returns in the AJAX server list
const PREFERRED_SERVERS = ['VidPlay', 'MegaPlay', 'HD-1', 'Vidstream', 'VidCloud', 'Kiwi Stream'];
// Also check these substrings to match partial server names (case-insensitive)
const PREFERRED_SERVER_PATTERNS = ['vidplay', 'megaplay', 'hd-1', 'vidstream', 'vidcloud', 'kiwi'];

// ─── Episode Card (matches web EpisodeCard) ──────────────────────────────────
function EpisodeCard({ ep, isActive, coverImage, onPress }) {
  const epNum = ep.absolute_episode_number || ep.episode_number;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[S.epCard, isActive && S.epCardActive]}
    >
      {/* Thumbnail */}
      <View style={S.epThumb}>
        <Image
          source={{ uri: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : coverImage }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => { }}
        />
        <View style={[S.epNumBadge, isActive && S.epNumBadgeActive]}>
          <Text style={[S.epNumText, isActive && S.epNumTextActive]}>E{epNum}</Text>
        </View>
        <View style={S.epDuration}>
          <Text style={S.epDurationText}>{ep.runtime ? `${ep.runtime}m` : '24m'}</Text>
        </View>
        {isActive && (
          <View style={S.playingOverlay}>
            <View style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end', height: 14 }}>
              {[0, 150, 300].map(delay => (
                <View key={delay} style={S.playBar} />
              ))}
            </View>
          </View>
        )}
      </View>
      {/* Info */}
      <View style={S.epInfo}>
        <Text style={[S.epTitle, isActive && S.epTitleActive]} numberOfLines={1}>
          {ep.name || `Episode ${epNum}`}
        </Text>
        <Text style={S.epOverview} numberOfLines={3}>
          {ep.overview || 'No synopsis available for this episode.'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const getTimeAgo = (dateString) => {
  if (!dateString) return '3 days ago';
  const diffTime = Math.abs(new Date() - new Date(dateString));
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 30) {
    return diffDays === 0 ? 'Today' : `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
  }
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
};

function VideoReleaseCard({ anime, onPress }) {
  return (
    <View style={S.releaseCard}>
      <TouchableOpacity onPress={onPress} style={S.releaseThumbnail} activeOpacity={0.85}>
        <Image source={{ uri: anime.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(0,0,0,0.2)', 'transparent', 'rgba(0,0,0,0.3)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={S.releasePlayCircle}>
          <Ionicons name="play" size={13} color="#fff" />
        </View>
        {anime.ep && (
          <View style={S.releaseEpBadge}>
            <Text style={S.releaseEpBadgeText}>{anime.ep.replace('Episode ', 'Ep ')}</Text>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={onPress} style={S.releaseInfoRow} activeOpacity={0.8}>
        <Image source={{ uri: anime.avatar || anime.image }} style={S.releaseAvatar} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={S.releaseEpLabel}>{anime.ep}</Text>
          <Text style={S.releaseTitle} numberOfLines={1}>{anime.title}</Text>
          <Text style={S.releaseTime}>{anime.time || 'Recently'}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function PlayerScreenInner() {
  const insets = useSafeAreaInsets();
  const insetsRef = useRef(insets);
  useEffect(() => { insetsRef.current = insets; }, [insets]);
  const { playerState, close, play, prefs, updatePrefs, minimize, maximize } = usePlayer();
  const { isActive, data, isMinimized } = playerState;
  const { user } = useAuth();

  // True while the OS has shrunk us into the native PiP bubble (false in Expo Go)
  const { isInPipMode: isInPip } = useIsInPip();

  const {
    animeId,
    animeTitle,
    coverImage,
    nativeTitle,
    synonyms = [],
    description,
    genres = [],
    idMal,
    episodes: passedEpisodes = [],
    episodeIndex = 0,
    relations = [],
    recommendations = [],
  } = data;

  // ── ALL STATE & REFS — declared before any useEffect that references them ──────────────────

  const [currentEpIdx, setCurrentEpIdx] = useState(episodeIndex);
  const [episodes, setEpisodes] = useState(passedEpisodes || []);

  useEffect(() => {
    setCurrentEpIdx(data.episodeIndex || 0);
    setEpisodes(data.episodes || []);
  }, [data.animeId, data.episodeIndex, data.episodes]);
  const [activeTab, setActiveTab] = useState('Episodes');
  const [streamUrl, setStreamUrl] = useState(null);
  const [isStreamLoading, setIsStreamLoading] = useState(true);
  const [isVideoLoading, setIsVideoLoading] = useState(true);

  // Native JSX Player states
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [showSkip, setShowSkip] = useState(false);
  const [skipTarget, setSkipTarget] = useState(0);
  const [skipText, setSkipText] = useState("");
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  const [availableSubtitles, setAvailableSubtitles] = useState([]);
  const [selectedSubtitleLabel, setSelectedSubtitleLabel] = useState('English');
  const selectedSubtitleRef = useRef('English');

  const [introData, setIntroData] = useState(null);
  const [outroData, setOutroData] = useState(null);

  useEffect(() => {
    Animated.timing(controlsOpacity, {
      toValue: isControlsVisible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isControlsVisible]);


  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const isScrubbingRef = useRef(false);
  const durationRef = useRef(0);
  const lastSkippedTargetRef = useRef(0);

  // Mutable refs for PiP / AppState closures — always read current values without stale closure
  const isPlayingRef = useRef(false);
  const isBufferingRef = useRef(false);
  const streamUrlRef = useRef(null);
  const isStreamLoadingRef = useRef(true);
  const chosenAllSourcesRef = useRef([]);
  const chosenRefererRef = useRef('');
  const chosenTracksRef = useRef([]);
  const refererBaseRef = useRef('https://anikoto.net/');

  // Progress bar track width (measured via onLayout for pixel-accurate dot positioning)
  const [trackWidth, setTrackWidth] = useState(0);

  // Progressive skip states
  const [skipAccumulator, setSkipAccumulator] = useState(0);
  const skipTimeoutRef = useRef(null);
  let controlsHideTimeout = useRef(null);

  const dubFailCountRef = useRef(0);

  // Hold-to-2x speed
  const [isHoldingSpeed, setIsHoldingSpeed] = useState(false);
  const isHoldingSpeedRef = useRef(false);
  const longPressTimerRef = useRef(null);

  const applyPlaybackRate = (rate) => {
    if (webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'setSpeed', value: rate }));
    }
  };

  const showControls = () => {
    setIsControlsVisible(true);
    if (controlsHideTimeout.current) clearTimeout(controlsHideTimeout.current);
    if (isPlayingRef.current) {
      controlsHideTimeout.current = setTimeout(() => setIsControlsVisible(false), 2500);
    }
  };

  const togglePlayPause = (forceState) => {
    if (webviewRef.current) {
      if (forceState === true) {
        webviewRef.current.postMessage(JSON.stringify({ type: 'play' }));
        setIsPlaying(true);
      } else if (forceState === false) {
        webviewRef.current.postMessage(JSON.stringify({ type: 'pause' }));
        setIsPlaying(false);
      } else {
        if (isPlaying) {
          webviewRef.current.postMessage(JSON.stringify({ type: 'pause' }));
          setIsPlaying(false);
        } else {
          webviewRef.current.postMessage(JSON.stringify({ type: 'play' }));
          setIsPlaying(true);
        }
      }
    }
    showControls();
  };

  const skipBy = (seconds) => {
    if (webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'seekBy', value: seconds }));
    }
    showControls();
  };

  const formatTime = (s) => {
    if (!s || isNaN(s) || s < 0) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const x = Math.floor(s % 60);
    const secStr = x < 10 ? `0${x}` : `${x}`;
    if (h > 0) {
      const minStr = m < 10 ? `0${m}` : `${m}`;
      return `${h}:${minStr}:${secStr}`;
    }
    return `${m}:${secStr}`;
  };

  const handleProgressiveSkip = (seconds) => {
    setSkipAccumulator(prev => {
      const next = prev + seconds;
      if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
      skipTimeoutRef.current = setTimeout(() => {
        skipBy(next);
        setSkipAccumulator(0);
      }, 500);
      return next;
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderGrant: (evt, gestureState) => {
        // Start long-press timer for 2x speed
        longPressTimerRef.current = setTimeout(() => {
          isHoldingSpeedRef.current = true;
          setIsHoldingSpeed(true);
          applyPlaybackRate(2);
        }, 400);
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Clear long-press timer
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        // If we were in 2x mode, revert to 1x
        if (isHoldingSpeedRef.current) {
          isHoldingSpeedRef.current = false;
          setIsHoldingSpeed(false);
          applyPlaybackRate(1);
          return; // Don't process tap/swipe when releasing from hold
        }
        const { dx, dy } = gestureState;
        if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
          // Swipe
          if (Math.abs(dy) > Math.abs(dx) && dy > 30) {
            // Swipe Down
            if (!isFullscreenRef.current) {
              if (prefs.miniplayer) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                minimize();
              } else {
                close();
              }
            } else {
              // Ignore swipe down in fullscreen if it starts near the top edge (e.g. status bar pull)
              if (gestureState.y0 < 50) return;
              toggleFullscreenState(false);
            }
          } else if (Math.abs(dy) > Math.abs(dx) && dy < -30) {
            // Swipe Up
            if (!isFullscreenRef.current) {
              toggleFullscreenState(true);
            }
          }
        } else {
          // Tap
          const now = Date.now();
          const DOUBLE_PRESS_DELAY = 300;
          if (now - (webviewRef.current?._lastTap || 0) < DOUBLE_PRESS_DELAY) {
            if (webviewRef.current?._singleTapTimer) clearTimeout(webviewRef.current._singleTapTimer);
            const { locationX } = evt.nativeEvent;
            const { width } = Dimensions.get('window');
            if (locationX > width / 2) handleProgressiveSkip(10);
            else handleProgressiveSkip(-10);
            if (webviewRef.current) webviewRef.current._lastTap = now;
          } else {
            if (webviewRef.current) {
              webviewRef.current._lastTap = now;
              webviewRef.current._singleTapTimer = setTimeout(() => {
                setIsControlsVisible(v => {
                  if (!v) showControls();
                  return !v;
                });
              }, DOUBLE_PRESS_DELAY);
            }
          }
        }
      }
    })
  ).current;

  const { width: screenWidth, height: screenHeightFull } = Dimensions.get('window');
  const miniWidth = 220;
  const miniHeight = 220 * 9 / 16;
  const defaultMiniX = screenWidth - miniWidth - 16;
  const defaultMiniY = screenHeightFull - miniHeight - 80;

  const miniPan = useRef(new Animated.ValueXY({ x: defaultMiniX, y: defaultMiniY })).current;

  const miniPlayerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (e, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        miniPan.setOffset({
          x: miniPan.x._value,
          y: miniPan.y._value
        });
        miniPan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: miniPan.x, dy: miniPan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (e, gestureState) => {
        miniPan.flattenOffset();

        const currentX = miniPan.x._value;
        const currentY = miniPan.y._value;

        const minX = 16;
        const maxX = screenWidth - miniWidth - 16;
        const minY = insets.top + 16;
        const maxY = screenHeightFull - miniHeight - 16;

        let targetX = currentX;
        let targetY = currentY;

        if (currentX < minX) targetX = minX;
        if (currentX > maxX) targetX = maxX;
        if (currentY < minY) targetY = minY;
        if (currentY > maxY) targetY = maxY;

        if (targetX !== currentX || targetY !== currentY) {
          Animated.spring(miniPan, {
            toValue: { x: targetX, y: targetY },
            useNativeDriver: false,
            friction: 5
          }).start();
        }
      }
    })
  ).current;

  const scrubPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e, gestureState) => {
        setIsScrubbing(true);
        isScrubbingRef.current = true;

        const { width } = Dimensions.get('window');
        const safeLeft = isFullscreenRef.current ? Math.max(insetsRef.current?.left || 0, 16) : 0;
        const safeRight = isFullscreenRef.current ? Math.max(insetsRef.current?.right || 0, 16) : 0;
        const trackWidth = width - safeLeft - safeRight;
        const percentage = Math.max(0, Math.min(1, (e.nativeEvent.pageX - safeLeft) / trackWidth));
        setScrubTime(percentage * durationRef.current);

        if (controlsHideTimeout.current) clearTimeout(controlsHideTimeout.current);
      },
      onPanResponderMove: (e, gestureState) => {
        const { width } = Dimensions.get('window');
        const safeLeft = isFullscreenRef.current ? Math.max(insetsRef.current?.left || 0, 16) : 0;
        const safeRight = isFullscreenRef.current ? Math.max(insetsRef.current?.right || 0, 16) : 0;
        const trackWidth = width - safeLeft - safeRight;
        const percentage = Math.max(0, Math.min(1, (gestureState.moveX - safeLeft) / trackWidth));
        setScrubTime(percentage * durationRef.current);
      },
      onPanResponderRelease: (e, gestureState) => {
        setIsScrubbing(false);
        isScrubbingRef.current = false;

        const { width } = Dimensions.get('window');
        const safeLeft = isFullscreenRef.current ? Math.max(insetsRef.current?.left || 0, 16) : 0;
        const safeRight = isFullscreenRef.current ? Math.max(insetsRef.current?.right || 0, 16) : 0;
        const trackWidth = width - safeLeft - safeRight;
        const percentage = Math.max(0, Math.min(1, (gestureState.moveX - safeLeft) / trackWidth));

        if (durationRef.current && webviewRef.current) {
          webviewRef.current.postMessage(JSON.stringify({ type: 'seek', value: percentage * durationRef.current }));
          setCurrentTime(percentage * durationRef.current);
        }
        showControls();
      }
    })
  ).current;

  // Track prefs in a ref so fetchStream (useCallback) always sees current values
  const prefsRef = useRef({ defaultType: 'sub', speed: 1 });
  const [showServerWarning, setShowServerWarning] = useState(true);
  const [activeType, setActiveType] = useState('sub');
  const [episodePage, setEpisodePage] = useState(Math.floor(currentEpIdx / EPISODES_PER_PAGE));
  const [sortOrder, setSortOrder] = useState('asc');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState('main');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const subtitlesEnabledRef = useRef(true);
  const [isDescOpen, setIsDescOpen] = useState(false);
  const [internalDescOpen, setInternalDescOpen] = useState(false);
  const [internalSettingsOpen, setInternalSettingsOpen] = useState(false);
  const [reactionCounts, setReactionCounts] = useState({ likes: 0, dislikes: 0 });
  const [userReaction, setUserReaction] = useState(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const screenHeight = Dimensions.get('window').height;
  const descSlideY = useRef(new Animated.Value(screenHeight)).current;
  const settingsSlideY = useRef(new Animated.Value(screenHeight)).current;

  // Refs so the AppState closure always reads the latest values (avoids stale closure)

  // Enter native PiP automatically when the user backgrounds the app while playing.
  // We intentionally pass [] and use refs so this listener is only created once
  // but always reads the freshest values — avoids stale-closure issues.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        nextAppState === 'background' &&
        isActive &&
        isPlayingRef.current &&
        !isBufferingRef.current &&
        !isStreamLoadingRef.current &&
        streamUrlRef.current &&
        Platform.OS === 'android'
      ) {
        safePip({ width: 16, height: 9 });
      }
    });
    return () => subscription.remove();
  }, [isActive]);

  useEffect(() => {
    if (isDescOpen) {
      setInternalDescOpen(true);
      Animated.spring(descSlideY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    } else {
      Animated.timing(descSlideY, { toValue: screenHeight, duration: 250, useNativeDriver: true }).start(() => {
        setInternalDescOpen(false);
      });
    }
  }, [isDescOpen]);

  const closeDescription = () => {
    setIsDescOpen(false);
  };

  const descScrollY = useRef(0);
  const descPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 5 && descScrollY.current <= 0,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          descSlideY.setValue(g.dy);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 1) {
          closeDescription();
        } else {
          Animated.spring(descSlideY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        }
      }
    })
  ).current;

  useEffect(() => {
    if (isSettingsOpen) {
      setInternalSettingsOpen(true);
      Animated.spring(settingsSlideY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    } else {
      Animated.timing(settingsSlideY, { toValue: screenHeight, duration: 250, useNativeDriver: true }).start(() => {
        setInternalSettingsOpen(false);
        setActiveMenu('main');
      });
    }
  }, [isSettingsOpen]);

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };

  const settingsScrollY = useRef(0);
  const settingsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 15 && Math.abs(g.dx) < 30 && settingsScrollY.current <= 0,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          settingsSlideY.setValue(g.dy);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 1) {
          closeSettings();
        } else {
          Animated.spring(settingsSlideY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        }
      }
    })
  ).current;

  const [commentCount, setCommentCount] = useState(0);
  const [topComment, setTopComment] = useState(null);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const activeTypeRef = useRef('sub');

  const [savedStatus, setSavedStatus] = useState(null);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [recentReleases, setRecentReleases] = useState([]);
  const [isRecentLoading, setIsRecentLoading] = useState(false);

  useEffect(() => {
    const fetchRecent = async () => {
      setIsRecentLoading(true);
      try {
        const RECENT_QUERY = `
        query {
          recent: Page(page: 1, perPage: 15) {
            media(sort: UPDATED_AT_DESC, type: ANIME, status: RELEASING, isAdult: false) {
              id title { romaji english } coverImage { extraLarge medium } nextAiringEpisode { episode } updatedAt
            }
          }
        }
        `;
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: RECENT_QUERY }),
        });
        const json = await res.json();

        const formatTimeAgo = (timestamp) => {
          if (!timestamp) return 'Recently';
          const seconds = Math.floor((new Date() - timestamp * 1000) / 1000);
          const interval = seconds / 86400;
          if (interval > 1) return `${Math.floor(interval)} days ago`;
          const hrs = seconds / 3600;
          if (hrs > 1) return `${Math.floor(hrs)} hours ago`;
          const mins = seconds / 60;
          if (mins > 1) return `${Math.floor(mins)} minutes ago`;
          return 'Just now';
        };

        if (json.data?.recent?.media) {
          const releases = json.data.recent.media.map(m => {
            const epNum = m.nextAiringEpisode ? Math.max(1, m.nextAiringEpisode.episode - 1) : 'Latest';
            return {
              id: m.id,
              title: m.title.english || m.title.romaji,
              image: m.coverImage.extraLarge,
              avatar: m.coverImage.medium,
              ep: `Episode ${epNum}`,
              epIndex: typeof epNum === 'number' ? Math.max(0, epNum - 1) : 0,
              time: formatTimeAgo(m.updatedAt),
            };
          });
          setRecentReleases(releases);
        }
      } catch (e) {
        console.log('Recent fetch error:', e);
      } finally {
        setIsRecentLoading(false);
      }
    };
    fetchRecent();
  }, []);

  useEffect(() => {
    if (animeId) {
      getList().then(list => {
        const saved = list.find(x => String(x.animeId) === String(animeId));
        setSavedStatus(saved ? saved.status : null);
      });

      const currentEp = data?.episodes?.[currentEpIdx];
      const epNum = currentEp?.number || (currentEpIdx + 1);

      fetchAniListCommentsPreview(animeId, epNum).then(({ totalComments, topComment }) => {
        setCommentCount(totalComments);
        setTopComment(topComment);
      });

      getReactionState(animeId, user?.uid || null).then(state => {
        setUserReaction(state.userReaction);
        setReactionCounts({ likes: state.likes, dislikes: state.dislikes });
      }).catch(console.log);
    }
  }, [animeId, currentEpIdx, data?.episodes, user?.uid]);

  const handleSaveStatus = async (status) => {
    if (!data) return;
    if (status === 'Remove') {
      await removeFromList(animeId);
      if (user?.uid) removeFromListCloud(user.uid, animeId).catch(() => { });
      setSavedStatus(null);
    } else {
      const listEntry = {
        animeId: data.animeId,
        animeTitle: data.animeTitle,
        coverImage: data.coverImage,
        status,
        format: data.format,
        year: data.startDate?.year,
        score: data.averageScore,
      };
      await saveToList(listEntry);
      if (user?.uid) saveListToCloud(user.uid, listEntry).catch(() => { });
      setSavedStatus(status);
    }
    setIsSaveMenuOpen(false);
  };

  const toggleFullscreenState = async (forceState) => {
    // If an event object is accidentally passed (from onPress), ignore it
    const isEvent = forceState && typeof forceState === 'object' && forceState.nativeEvent;
    const nextState = (forceState !== undefined && !isEvent) ? forceState : !isFullscreenRef.current;
    if (isFullscreenRef.current === nextState) return;

    isFullscreenRef.current = nextState;
    setIsFullscreen(nextState);

    webviewRef.current?.injectJavaScript(`
      try {
        var el1 = document.getElementById('fsexp');
        var el2 = document.getElementById('fscol');
        if (el1 && el2) {
          el1.style.display = '${nextState ? 'none' : 'block'}';
          el2.style.display = '${nextState ? 'block' : 'none'}';
        }
      } catch(e) {}
      true;
    `);

    if (Platform.OS !== 'web') {
      try {
        if (nextState) {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } catch (e) {
        console.warn('ScreenOrientation not available');
      }
    }
  };

  // Settings state — mirrors React app CustomVideoPlayer
  const [streamData, setStreamData] = useState(null);
  const [currentServer, setCurrentServer] = useState('');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [qualityLevels, setQualityLevels] = useState([{ height: 'Auto', index: -1 }]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isFullscreenRef = useRef(false);

  const webviewRef = useRef(null);
  const progressRef = useRef({ time: 0, duration: 0 }); // track without re-render

  useEffect(() => {
    if (webviewRef.current) {
      webviewRef.current.injectJavaScript(`
        if (${isInPip}) {
          document.body.classList.add('in-pip');
        } else {
          document.body.classList.remove('in-pip');
        }
        true;
      `);
    }
  }, [isInPip]);

  useEffect(() => {
    // Keep refs in sync so the AppState closure never reads stale values
    isPlayingRef.current = isPlaying;
    isBufferingRef.current = isBuffering;
    streamUrlRef.current = streamUrl;
    isStreamLoadingRef.current = isStreamLoading;
    // Tell Android to auto-enter PiP when user presses Home/Overview (Android 12+)
    if (Platform.OS === 'android') {
      if (streamUrl && !isStreamLoading && isPlaying && !isBuffering) {
        safeSetPipParams({ autoEnterEnabled: true, width: 16, height: 9 });
      } else {
        safeSetPipParams({ autoEnterEnabled: false });
      }
    }
  }, [streamUrl, isStreamLoading, isPlaying, isBuffering]);

  // Clean up PiP state on unmount so the app doesn't accidentally enter PiP when the player is closed
  useEffect(() => {
    return () => {
      if (Platform.OS === 'android') {
        safeSetPipParams({ autoEnterEnabled: false });
      }
    };
  }, []);

  const currentEp = episodes[currentEpIdx];

  const sortedEpisodes = [...episodes].sort((a, b) => {
    const aNum = a.absolute_episode_number || a.episode_number || 0;
    const bNum = b.absolute_episode_number || b.episode_number || 0;
    return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
  });

  const totalEpPages = Math.max(1, Math.ceil(sortedEpisodes.length / EPISODES_PER_PAGE));
  const pagedEps = sortedEpisodes.slice(episodePage * EPISODES_PER_PAGE, (episodePage + 1) * EPISODES_PER_PAGE);
  const playingTitle = currentEp?.name || (currentEp ? `Episode ${currentEp.absolute_episode_number || currentEp.episode_number}` : 'Episode 1');

  // Load player prefs on mount, save history entry
  useEffect(() => {
    getPlayerPrefs().then(p => {
      if (p.speed && p.speed !== 1) setPlaybackSpeed(p.speed);
      if (p.defaultType) {
        setActiveType(p.defaultType);
        activeTypeRef.current = p.defaultType;
        prefsRef.current = { defaultType: p.defaultType, speed: p.speed || 1 };
      }
      setPrefsLoaded(true);
    });
    // Save initial history entry (local + cloud)
    const historyEntry = {
      animeId, animeTitle, coverImage,
      episodeIndex: currentEpIdx,
      episodeTitle: episodes[currentEpIdx]?.name || `Episode ${currentEpIdx + 1}`,
      totalEpisodes: episodes.length,
    };
    saveToHistory(historyEntry);
    if (user?.uid) {
      saveHistoryToCloud(user.uid, historyEntry).catch(() => { });
    }
    // On unmount, save final progress (local + cloud)
    return () => {
      const { time, duration } = progressRef.current;
      if (time > 5) {
        updateProgress({ animeId, episodeIndex: currentEpIdx, progress: time, duration });
        if (user?.uid) {
          updateProgressInCloud(user.uid, animeId, currentEpIdx, time, duration).catch(() => { });
        }
      }
    };
  }, [animeId, currentEpIdx, user?.uid]);

  // Hardware back button
  const handleBackPress = () => {
    if (isSettingsOpen) { setIsSettingsOpen(false); return true; }
    if (isFullscreenRef.current) {
      toggleFullscreenState(false);
      return true;
    }

    if (isMinimized) {
      return false; // let the underlying screen handle the back button when in miniplayer
    }

    // If the video is currently playing, enter in-app miniplayer instead of closing
    if (isPlayingRef.current && !isInPip && prefs.miniplayer) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      minimize();
      return true;
    }

    close();
    return true;
  };

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, [isActive, isSettingsOpen, isMinimized, prefs.miniplayer, isInPip]);

  // ── Fetch stream by scraping anikoto.net directly (no external API needed) ──
  // Flow: scrapeSearch → scrapeWatch → extractStreamUrl → m3u8 URL + referer
  //       HLS.js custom loader injects Referer header on every segment request
  const fetchStream = useCallback(async (forceType = null) => {
    setIsStreamLoading(true);
    setStreamUrl(null);
    setIsVideoLoading(true);
    setQualityLevels([{ height: 'Auto', index: -1 }]);
    setCurrentQuality(-1);
    try {
      // 1. Search for the anime
      console.log(`[DEBUG] Searching for animeTitle: ${animeTitle}`);
      let searchData = await scrapeSearch(animeTitle);

      if (!searchData?.results?.length && animeTitle.includes(':')) {
        const shortTitle = animeTitle.split(':')[0].trim();
        console.log(`[DEBUG] Fallback searching shortTitle: ${shortTitle}`);
        searchData = await scrapeSearch(shortTitle);
      }

      if (!searchData?.results?.length && animeTitle.match(/Season \d+/i)) {
        const noSeason = animeTitle.replace(/Season \d+/i, '').replace(':', '').trim();
        console.log(`[DEBUG] Fallback searching without season: ${noSeason}`);
        searchData = await scrapeSearch(noSeason);
      }

      if (!searchData?.results?.length && nativeTitle) {
        console.log(`[DEBUG] Fallback searching nativeTitle: ${nativeTitle}`);
        searchData = await scrapeSearch(nativeTitle);
      }

      if (!searchData?.results?.length && synonyms?.length > 0) {
        console.log(`[DEBUG] Fallback searching synonym: ${synonyms[0]}`);
        searchData = await scrapeSearch(synonyms[0]);
      }

      if (!searchData?.results?.length) {
        console.log('[DEBUG] No search results from scrapeSearch for:', animeTitle);
        return;
      }

      const results = searchData.results;
      console.log(`[DEBUG] Found ${results.length} search results. First match:`, results[0].slug);

      // API uses 'title' and 'titleJp' fields
      const possibleTitles = [animeTitle, nativeTitle, ...synonyms].filter(Boolean).map(t => t.toLowerCase().trim());

      // Find best match — check title and titleJp
      let bestMatch = results[0];

      // 1. Strict exact match first
      let exactMatch = results.find(r => {
        const rName = (r.title || r.name || '').toLowerCase().trim();
        const rJname = (r.titleJp || '').toLowerCase().trim();
        return possibleTitles.includes(rName) || possibleTitles.includes(rJname);
      });

      // 2. Exact match after stripping tags like (TV), (Dub), etc.
      if (!exactMatch) {
        exactMatch = results.find(r => {
          const cleanName = (r.title || r.name || '').toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
          const cleanJname = (r.titleJp || '').toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
          return possibleTitles.includes(cleanName) || possibleTitles.includes(cleanJname);
        });
      }

      // 3. If no strict match, fallback to fuzzy match picking the one closest in length
      //    (also penalizing the word 'movie' or '0' if not in our original titles)
      if (!exactMatch) {
        let highestScore = -1;
        for (const r of results) {
          const rName = (r.title || r.name || '').toLowerCase().trim();
          const rJname = (r.titleJp || '').toLowerCase().trim();

          for (const t of possibleTitles) {
            if (rName.includes(t) || t.includes(rName) || rJname.includes(t) || t.includes(rJname)) {
              let score = 1000 - Math.min(Math.abs(rName.length - t.length), Math.abs(rJname.length - t.length));
              // Penalize results that add "movie" or " 0 " when the target title doesn't have it
              if (!t.includes('movie') && rName.includes('movie')) score -= 100;
              if (!t.includes(' 0') && (rName.includes(' 0') || rName.endsWith(' 0'))) score -= 100;

              if (score > highestScore) {
                highestScore = score;
                exactMatch = r;
              }
            }
          }
        }
      }

      if (exactMatch) bestMatch = exactMatch;

      const slug = bestMatch.slug || bestMatch.id;
      const epNum = currentEpIdx + 1;

      console.log(`[DEBUG] Calling scrapeWatch for slug: ${slug}, epNum: ${epNum}`);
      let hasStartedPlaying = false;

      const processData = async (data, isFinal = false) => {
        if (!data || !data.sources?.length) return;

        // Sort sources to prefer 'auto' quality so HLS sees all resolutions
        data.sources.sort((a, b) => {
          const aIsAuto = a.quality === 'auto' || a.quality === 'default';
          const bIsAuto = b.quality === 'auto' || b.quality === 'default';
          if (aIsAuto && !bIsAuto) return -1;
          if (!aIsAuto && bIsAuto) return 1;
          return 0;
        });

        setStreamData(data); // update UI with available servers

        if (hasStartedPlaying) return;

        // Since we are lazy loading backup servers, their m3u8 is null initially.
        const validSources = data.sources.filter(s => s.m3u8 || s.url);
        const sources = validSources.length > 0 ? validSources : data.sources;

        const actuallyHasDub = data.episode?.hasDub || sources.some(s => s.type === 'dub');
        const userPrefType = forceType || prefsRef.current.defaultType || 'sub';
        let wantType = userPrefType;

        if (wantType === 'dub' && !actuallyHasDub) {
          if (!isFinal) return; // Wait for dub streams to possibly arrive
          wantType = 'sub';
        }

        const isValid = (s) => {
          if (!s.m3u8 && !s.url) return false;
          if (wantType === 'dub' && s.type === 'dub') {
            const subVer = sources.find(x => x.server === s.server && x.type === 'sub' && (x.m3u8 || x.url));
            if (subVer && s.m3u8 && subVer.m3u8 && s.m3u8 === subVer.m3u8) return false;
          }
          return true;
        };

        let chosen = null;
        if (currentServer) {
          chosen = sources.find(s => s.server === currentServer && s.type === wantType && isValid(s));
        }
        if (!chosen) {
          // Match by pattern (case-insensitive substring) — prefer servers with m3u8 already extracted
          for (const pat of PREFERRED_SERVER_PATTERNS) {
            chosen = sources.find(s => s.server?.toLowerCase().includes(pat) && s.type === wantType && isValid(s) && s.m3u8);
            if (chosen) break;
          }
          if (!chosen) {
            // Fallback: match by pattern even without m3u8 (will be extracted on demand)
            for (const pat of PREFERRED_SERVER_PATTERNS) {
              chosen = sources.find(s => s.server?.toLowerCase().includes(pat) && s.type === wantType && isValid(s));
              if (chosen) break;
            }
          }
        }
        if (!chosen) {
          chosen = sources.find(s => s.type === wantType && isValid(s) && s.m3u8) || sources.find(s => s.type === wantType && isValid(s));
        }
        if (!chosen) {
          chosen = sources.find(s => s.type === wantType && isValid(s) && s.m3u8) || sources.find(s => s.type === wantType && isValid(s));
        }

        if (!chosen) {
          if (!isFinal) return; // Wait for our preferred type to arrive before falling back
          chosen = sources.find(s => isValid(s) && s.m3u8) || sources.find(s => isValid(s)) || null;
        }

        if (chosen) {
          hasStartedPlaying = true;
          const resolvedType = chosen.type === 'dub' ? 'dub' : 'sub';

          // KEEP user's selected preference in UI
          setActiveType(userPrefType);
          activeTypeRef.current = userPrefType;

          if (userPrefType === 'dub' && resolvedType === 'sub') {
            dubFailCountRef.current += 1;
            if (dubFailCountRef.current >= 3) {
              Alert.alert('Dub Not Available', 'Dub has not been available for the last few tries. We kept your preference on Dub, but are playing Sub instead.');
              dubFailCountRef.current = 0; // reset after notifying
            }
          } else if (resolvedType === 'dub') {
            dubFailCountRef.current = 0; // reset if successful
          }

          if (!currentServer || currentServer !== chosen.server) {
            autoServerChangeRef.current = true;
            setCurrentServer(chosen.server || '');
          }

          let streamSrc = chosen.m3u8;
          if (!streamSrc && chosen.url && !chosen.url.includes('.m3u8')) {
            const serverNameLower = (chosen.server || '').toLowerCase();
            const isVidstreamLike = serverNameLower.includes('vidstream') || serverNameLower.includes('vidplay') || serverNameLower.includes('vid-');
            let extracted = isVidstreamLike ? await extractVidstream(chosen.url, chosen.referer).catch(() => null) : null;
            if (!extracted) extracted = await extractStreamUrl(chosen.url);
            if (extracted) {
              streamSrc = extracted.m3u8;
              chosen.m3u8 = extracted.m3u8;
              if (extracted.referer) chosen.referer = extracted.referer;
              if (extracted.tracks) chosen.tracks = extracted.tracks;
              if (extracted.intro) chosen.intro = extracted.intro;
              if (extracted.outro) chosen.outro = extracted.outro;
              if (extracted.allSources) chosen.allSources = extracted.allSources;
            }
          } else if (!streamSrc && chosen.url) {
            streamSrc = chosen.url;
          }

          const tracks = chosen.tracks || [];
          const intro = chosen.intro || null;
          const outro = chosen.outro || null;
          const initialTime = progressRef.current?.time || 0;
          let refererBase = 'https://anikoto.net/';
          try { if (chosen.referer) refererBase = new URL(chosen.referer).origin + '/'; } catch (e) { }
          chosenAllSourcesRef.current = chosen.allSources || [];
          chosenRefererRef.current = chosen.referer || '';
          chosenTracksRef.current = tracks;
          refererBaseRef.current = refererBase;

          setIntroData(intro);
          setOutroData(outro);

          console.log(`[DEBUG] Playing: server=${chosen.server} type=${chosen.type} m3u8=${streamSrc} referer=${chosen.referer} baseUrl=${refererBase}`);
          setStreamUrl({ html: buildPlayerHTML(streamSrc, chosen.referer || '', tracks, playbackSpeed, initialTime, subtitlesEnabledRef.current, intro, outro, isPlayingRef.current || prefs.autoPlay), baseUrl: refererBase });
          setIsStreamLoading(false);
        }
      };

      const finalData = await scrapeWatch(slug, String(epNum), processData, idMal);
      await processData(finalData, true);

      if (!hasStartedPlaying) {
        console.log('[DEBUG] No playable source found. All extraction failed.');
        setTimeout(() => setIsStreamLoading(false), 4000);
      }
    } catch (e) {
      console.log('Stream fetch error:', e);
      setTimeout(() => setIsStreamLoading(false), 4000);
    }
  }, [animeTitle, currentEpIdx, nativeTitle, synonyms, currentServer, idMal]);

  const autoServerChangeRef = useRef(false);

  useEffect(() => {
    if (prefsLoaded) {
      if (autoServerChangeRef.current) {
        autoServerChangeRef.current = false;
        return;
      }
      fetchStream();
    }
  }, [fetchStream, prefsLoaded]);

  useEffect(() => {
    setEpisodePage(Math.floor(currentEpIdx / EPISODES_PER_PAGE));
  }, [currentEpIdx]);

  // Build the player HTML with a HLS.js custom loader that adds Referer/Origin headers.
  // This eliminates the need for any external proxy — all HLS requests are made via
  // fetch() with the correct headers injected directly in the WebView.
  const buildPlayerHTML = (src, referer = '', tracks = [], initialSpeed = 1, initialTime = 0, initialSubtitles = true, intro = null, outro = null, initialAutoPlay = false) => {
    const subtitleTracks = (tracks || []).filter(t => t.kind === 'captions' || t.kind === 'subtitles');

    let activeSub = selectedSubtitleRef.current;
    if (subtitleTracks.length > 0 && !subtitleTracks.find(s => s.label === activeSub)) {
      const engSub = subtitleTracks.find(s => s.label?.toLowerCase().includes('english') || s.label?.toLowerCase().includes('eng'));
      activeSub = engSub ? engSub.label : subtitleTracks[0].label;
      selectedSubtitleRef.current = activeSub;
      setTimeout(() => {
        setAvailableSubtitles(subtitleTracks);
        setSelectedSubtitleLabel(activeSub);
      }, 0);
    } else if (subtitleTracks.length > 0) {
      setTimeout(() => setAvailableSubtitles(subtitleTracks), 0);
    } else {
      setTimeout(() => setAvailableSubtitles([]), 0);
    }

    const trackTags = subtitleTracks
      .map((t, i) => {
        const trackSrc = t.file || t.url || '';
        let isDefault = t.label === activeSub;
        if (!subtitleTracks.some(x => x.label === activeSub) && i === 0) isDefault = true;
        return `<track kind="subtitles" src="${trackSrc}" label="${t.label || 'Sub'}" srclang="en" ${(isDefault && initialSubtitles) ? 'default' : ''}>`;
      })
      .join('');

    const safeReferer = referer || '';
    const safeOrigin = (() => { try { return safeReferer ? new URL(safeReferer).origin : ''; } catch (_) { return ''; } })();

    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{width:100%;height:100%;background:#000;overflow:hidden;}
#vid{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;}
::cue{font-family:sans-serif;font-size:1.05em;font-weight:800;color:#ffffff;background:transparent;text-shadow:0 2px 8px rgba(0,0,0,0.95),0 0 24px rgba(0,0,0,0.8),-1px -1px 0 rgba(0,0,0,0.6),1px -1px 0 rgba(0,0,0,0.6),-1px 1px 0 rgba(0,0,0,0.6),1px 1px 0 rgba(0,0,0,0.6);letter-spacing:0.02em;line-height:1.5;}
</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
</head><body>
<video id="vid" playsinline webkit-playsinline crossorigin="anonymous">${trackTags}</video>
<script>
(function(){
var vid=document.getElementById('vid');
var hls=null,src=${JSON.stringify(src)},spd=${initialSpeed || 1},startTime=${initialTime || 0};
var REFERER=${JSON.stringify(safeReferer)},ORIGIN=${JSON.stringify(safeOrigin)};
var introData=${JSON.stringify(intro)}, outroData=${JSON.stringify(outro)}, autoPlay=${initialAutoPlay};

var _rnt={};
function rn(t,p){
  if(t==='timeUpdate'){var n=Date.now();if(_rnt[t]&&n-_rnt[t]<100)return;_rnt[t]=n;}
  try{window.ReactNativeWebView.postMessage(JSON.stringify({type:t,payload:p}));}catch(e){}
}

vid.addEventListener('play',function(){ rn('playbackState', {playing:true}); if('mediaSession' in navigator) navigator.mediaSession.playbackState='playing'; });
vid.addEventListener('pause',function(){ rn('playbackState', {playing:false}); if('mediaSession' in navigator) navigator.mediaSession.playbackState='paused'; });
vid.addEventListener('waiting',function(){ rn('buffering', true); });
vid.addEventListener('playing',function(){ rn('buffering', false); });
vid.addEventListener('seeked',function(){ rn('buffering', false); });
vid.addEventListener('canplay',function(){ rn('buffering', false); });
vid.addEventListener('ended',function(){ rn('ended', {}); });
vid.addEventListener('error',function(){ rn('error', {}); });

vid.addEventListener('timeupdate',function(){
  var d=vid.duration||0,t=vid.currentTime||0;
  var b=0; if(vid.buffered.length>0) b=vid.buffered.end(vid.buffered.length-1);
  var showSkip=false; var skipTarget=0; var skipText="";
  if(introData && t>=introData.start && t<=introData.end){ skipText="Skip Intro"; skipTarget=introData.end; showSkip=true; }
  else if(outroData && t>=outroData.start && t<=outroData.end){ skipText="Skip Outro"; skipTarget=outroData.end; showSkip=true; }
  rn('timeUpdate', {time:t, duration:d, buffered:b, showSkip:showSkip, skipTarget:skipTarget, skipText:skipText});
});
vid.addEventListener('loadedmetadata',function(){
  rn('loaded', {duration:vid.duration});
});

if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({ title: ${JSON.stringify(animeTitle || 'Episode')}, artist: ${JSON.stringify(animeTitle || 'Anime')} });
  navigator.mediaSession.setActionHandler('play', function() { vid.play().catch(function(){}); });
  navigator.mediaSession.setActionHandler('pause', function() { vid.pause(); });
  navigator.mediaSession.setActionHandler('seekbackward', function() { vid.currentTime = Math.max(0, vid.currentTime - 10); });
  navigator.mediaSession.setActionHandler('seekforward', function() { vid.currentTime = Math.min(vid.duration || 0, vid.currentTime + 10); });
}

function loadSrc(url){
  if(hls){hls.destroy();hls=null;}
  if(window.Hls && Hls.isSupported()){
    function getLevels(){
      return hls.levels.map(function(l,i){
        var h=l.height||0;
        var w=l.width||0;
        if(h===0&&w>0) h=Math.round(w*9/16);
        if(h===0&&l.attrs){
          if(l.attrs.NAME){
            var nMatch=(''+l.attrs.NAME).match(/(\d{3,4})/);
            if(nMatch) h=parseInt(nMatch[1],10);
          }
          if(h===0&&l.attrs.RESOLUTION){
            var rMatch=(''+l.attrs.RESOLUTION).match(/x(\d{3,4})/i);
            if(rMatch) h=parseInt(rMatch[1],10);
          }
        }
        if(h===0&&l.bitrate){
          var kbps=Math.round(l.bitrate/1000);
          if(kbps>=3500) h=1080;
          else if(kbps>=1800) h=720;
          else if(kbps>=800) h=480;
          else if(kbps>=400) h=360;
          else h=240;
        }
        if(h===0){
          var stds=[1080,720,480,360,240];
          h=stds[i]||Math.max(240,1080-i*240);
        }
        return {height:h,index:i,bitrate:l.bitrate||0};
      });
    }
    var hlsConfig = {enableWorker:false,maxBufferLength:30,startLevel:-1};
    hls=new Hls(hlsConfig);
    hls.loadSource(url);
    hls.attachMedia(vid);
    hls.on(Hls.Events.MANIFEST_PARSED,function(){
      if(spd!==1)vid.playbackRate=spd;
      if(startTime>0){vid.currentTime=startTime;startTime=0;}
      var levels=getLevels();
      rn('qualities',{levels:levels,count:levels.length});
      if(autoPlay) vid.play().catch(function(){});
    });
    // Re-send all levels once HLS has loaded level metadata (more complete info)
    hls.on(Hls.Events.LEVEL_LOADED,function(){
      var levels=getLevels();
      if(levels.length>0) rn('qualities',{levels:levels,count:levels.length});
    });
    hls.on(Hls.Events.LEVEL_SWITCHING,function(){
      var levels=getLevels();
      if(levels.length>0) rn('qualities',{levels:levels,count:levels.length});
    });
    hls.on(Hls.Events.ERROR,function(e,d){
      if(d.fatal){
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          hls.destroy();
          rn('error', {});
        }
      }
    });
  } else if(vid.canPlayType('application/vnd.apple.mpegurl')){
    vid.src=url;
    vid.addEventListener('loadedmetadata',function(){
      if(spd!==1)vid.playbackRate=spd;
      if(startTime>0){vid.currentTime=startTime;startTime=0;}
    });
    if(autoPlay) vid.play().catch(function(){});
  } else {
    rn('error', {});
  }
}
function onMsg(e){
  try{
    var m=JSON.parse(e.data);
    if(m.type==='play')vid.play().catch(function(){});
    if(m.type==='pause')vid.pause();
    if(m.type==='seek')vid.currentTime=m.value;
    if(m.type==='seekBy')vid.currentTime=Math.max(0,Math.min(vid.duration||0,vid.currentTime+m.value));
    if(m.type==='setSpeed'){vid.playbackRate=m.value;spd=m.value;}
    if(m.type==='setSrc')loadSrc(m.value);
    if(m.type==='setQuality'&&hls){hls.currentLevel=m.value;}
    if(m.type==='setAudioBoost'){vid.volume=m.value/100;}
    if(m.type==='setSubtitle'){for(var i=0;i<vid.textTracks.length;i++){vid.textTracks[i].mode=(!m.value)?'hidden':(vid.textTracks[i].label===m.label?'showing':'hidden');}}
  }catch(_){}
}
window.addEventListener('message',onMsg);document.addEventListener('message',onMsg);
loadSrc(src);
})();
</script>
</body>
</html>`;
  };

  const toggleSubtitles = (enabled, label = selectedSubtitleRef.current) => {
    setSubtitlesEnabled(enabled);
    subtitlesEnabledRef.current = enabled;
    setSelectedSubtitleLabel(label);
    selectedSubtitleRef.current = label;
    if (webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'setSubtitle', value: enabled, label: label }));
    }
    setActiveMenu('main');
  };

  const toggleDub = async () => {
    if (!streamData) return;
    const actuallyHasDub = streamData?.episode?.hasDub || streamData?.sources?.some(s => s.type === 'dub');

    const newType = activeType === 'sub' ? 'dub' : 'sub';
    setActiveType(newType);
    activeTypeRef.current = newType;
    updatePrefs({ defaultType: newType });

    if (newType === 'dub' && !actuallyHasDub) {
      Alert.alert('Preference Saved', 'Dub is not available for this episode, but we will try to play dub for future episodes. Playing sub for now.');
      return;
    }

    const sources = streamData.sources || [];
    const isValid = (s) => {
      if (newType === 'dub' && s.type === 'dub') {
        const subVer = sources.find(x => x.server === s.server && x.type === 'sub');
        if (subVer && ((s.proxyUrl && s.proxyUrl === subVer.proxyUrl) || (s.m3u8 && s.m3u8 === subVer.m3u8))) return false;
      }
      return true;
    };

    let chosen = null;
    if (currentServer) {
      chosen = sources.find(s => s.server === currentServer && s.type === newType && isValid(s));
    }
    if (!chosen) {
      for (const pref of PREFERRED_SERVERS) {
        chosen = sources.find(s => s.server === pref && s.type === newType && isValid(s));
        if (chosen) break;
      }
      if (!chosen) {
        chosen = sources.find(s => s.type === newType && isValid(s));
      }
      if (!chosen) {
        if (currentServer) chosen = sources.find(s => s.server === currentServer && s.type === newType);
        if (!chosen) chosen = sources.find(s => s.type === newType);
      }
    }

    if (chosen) {
      setCurrentServer(chosen.server || '');
      setIsVideoLoading(true);

      let streamSrc = chosen.m3u8;
      if (!streamSrc && chosen.url && !chosen.url.includes('.m3u8')) {
        const serverNameLower = (chosen.server || '').toLowerCase();
        const isVidstreamLike = serverNameLower.includes('vidstream') || serverNameLower.includes('vidplay') || serverNameLower.includes('vid-');
        let extracted = isVidstreamLike ? await extractVidstream(chosen.url, chosen.referer).catch(() => null) : null;
        if (!extracted) extracted = await extractStreamUrl(chosen.url);
        if (extracted) {
          streamSrc = extracted.m3u8;
          chosen.m3u8 = extracted.m3u8;
          if (extracted.referer) chosen.referer = extracted.referer;
          if (extracted.tracks) chosen.tracks = extracted.tracks;
          if (extracted.intro) chosen.intro = extracted.intro;
          if (extracted.outro) chosen.outro = extracted.outro;
          if (extracted.allSources) chosen.allSources = extracted.allSources;
        }
      } else if (!streamSrc && chosen.url) {
        streamSrc = chosen.url;
      }

      const tracks = chosen.tracks || [];
      const intro = chosen.intro || null;
      const outro = chosen.outro || null;
      const initialTime = progressRef.current?.time || 0;
      let refererBase = 'https://anikoto.net/';
      try { if (chosen.referer) refererBase = new URL(chosen.referer).origin + '/'; } catch (e) { }

      chosenAllSourcesRef.current = chosen.allSources || [];
      chosenRefererRef.current = chosen.referer || '';
      chosenTracksRef.current = tracks;
      refererBaseRef.current = refererBase;

      setIntroData(intro);
      setOutroData(outro);

      setStreamUrl({ html: buildPlayerHTML(streamSrc, chosen.referer || '', tracks, playbackSpeed, initialTime, subtitlesEnabledRef.current, intro, outro, isPlayingRef.current || prefs.autoPlay), baseUrl: refererBase });
    }
  };

  const handleServerChange = async (serverName, serverType = null) => {
    if (!streamData?.sources) return;
    const wantType = serverType || activeTypeRef.current;
    const chosen = streamData.sources.find(s => s.server === serverName && s.type === wantType)
      || streamData.sources.find(s => s.server === serverName)
      || null;
    if (!chosen) return;

    // Update activeType if it changed
    const resolvedType = chosen.type === 'dub' ? 'dub' : 'sub';
    if (resolvedType !== activeType) {
      setActiveType(resolvedType);
      activeTypeRef.current = resolvedType;
    }

    setCurrentServer(serverName);
    setActiveMenu('main');
    setIsVideoLoading(true);

    let streamSrc = chosen.m3u8;
    if (!streamSrc && chosen.url && !chosen.url.includes('.m3u8')) {
      const serverNameLower = (chosen.server || '').toLowerCase();
      const isVidstreamLike = serverNameLower.includes('vidstream') || serverNameLower.includes('vidplay') || serverNameLower.includes('vid-');
      let extracted = isVidstreamLike ? await extractVidstream(chosen.url, chosen.referer).catch(() => null) : null;
      if (!extracted) extracted = await extractStreamUrl(chosen.url);
      if (extracted) {
        streamSrc = extracted.m3u8;
        chosen.m3u8 = extracted.m3u8;
        if (extracted.referer) chosen.referer = extracted.referer;
        if (extracted.tracks) chosen.tracks = extracted.tracks;
        if (extracted.intro) chosen.intro = extracted.intro;
        if (extracted.outro) chosen.outro = extracted.outro;
        if (extracted.allSources) chosen.allSources = extracted.allSources;
      }
    } else if (!streamSrc && chosen.url) {
      streamSrc = chosen.url;
    }

    const tracks = chosen.tracks || [];
    const intro = chosen.intro || null;
    const outro = chosen.outro || null;
    const initialTime = progressRef.current?.time || 0;
    let refererBase = 'https://anikoto.net/';
    try { if (chosen.referer) refererBase = new URL(chosen.referer).origin + '/'; } catch (e) { }

    chosenAllSourcesRef.current = chosen.allSources || [];
    chosenRefererRef.current = chosen.referer || '';
    chosenTracksRef.current = tracks;
    refererBaseRef.current = refererBase;

    setIntroData(intro);
    setOutroData(outro);

    const playerHTML = buildPlayerHTML(streamSrc, chosen.referer || '', tracks, playbackSpeed, initialTime, subtitlesEnabledRef.current, intro, outro, isPlayingRef.current || prefs.autoPlay);
    setStreamUrl({ html: playerHTML, baseUrl: refererBase });
  };

  // Change playback speed via postMessage into WebView
  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    setActiveMenu('main');
    savePlayerPrefs({ speed }); // persist
    if (webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'setSpeed', value: speed }));
    }
  };

  // Change stream quality via postMessage into WebView or stream reload
  const handleQualityChange = (q) => {
    const idx = typeof q === 'object' ? q.index : q;
    const fileUrl = typeof q === 'object' ? q.fileUrl : null;
    setCurrentQuality(idx);
    setActiveMenu('main');
    if (fileUrl && webviewRef.current) {
      setIsVideoLoading(true);
      // Seamlessly switch source inside the existing player to preserve proxy headers
      webviewRef.current.postMessage(JSON.stringify({ type: 'setSrc', value: fileUrl }));
    } else if (webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'setQuality', value: idx }));
    }
  };

  useEffect(() => {
    if (webviewRef.current && prefs.audioBoost !== undefined) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'setAudioBoost', value: prefs.audioBoost }));
    }
  }, [prefs.audioBoost]);

  const changeEpisode = async (idx, server, type) => {
    setIsVideoLoading(true);
    setDuration(0);
    setCurrentTime(0);
    durationRef.current = 0;

    try {
      const { getHistory } = require('../data/constants');
      const h = await getHistory();
      const existing = h.find(x => String(x.animeId) === String(animeId) && String(x.episodeIndex) === String(idx));
      if (existing && existing.progress > 0) {
        progressRef.current = { time: existing.progress, duration: existing.duration || 0 };
      } else {
        progressRef.current = { time: 0, duration: 0 };
      }
    } catch (e) {
      progressRef.current = { time: 0, duration: 0 };
    }

    lastSkippedTargetRef.current = 0;

    setCurrentEpIdx(idx);
    if (server) setCurrentServer(server);
    if (type) {
      setActiveType(type);
      activeTypeRef.current = type;
      updatePrefs({ defaultType: type });
    }
  };

  const handleReaction = async (reactionType) => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to like or dislike.');
      return;
    }

    // Optimistic UI Update
    const prevReaction = userReaction;
    const prevCounts = { ...reactionCounts };

    let nextReaction = prevReaction === reactionType ? null : reactionType;
    let nextCounts = { ...prevCounts };

    if (prevReaction === reactionType) {
      nextCounts[reactionType === 'like' ? 'likes' : 'dislikes'] = Math.max(0, nextCounts[reactionType === 'like' ? 'likes' : 'dislikes'] - 1);
    } else {
      if (prevReaction) {
        nextCounts[prevReaction === 'like' ? 'likes' : 'dislikes'] = Math.max(0, nextCounts[prevReaction === 'like' ? 'likes' : 'dislikes'] - 1);
      }
      nextCounts[reactionType === 'like' ? 'likes' : 'dislikes']++;
    }

    setUserReaction(nextReaction);
    setReactionCounts(nextCounts);

    try {
      const res = await toggleReaction(animeId, user.uid, user.displayName, animeTitle, reactionType);
      // Ensure sync
      setUserReaction(res.userReaction);
      setReactionCounts({ likes: res.likes, dislikes: res.dislikes });
    } catch (e) {
      console.log('Reaction Error', e);
      // Revert on error
      setUserReaction(prevReaction);
      setReactionCounts(prevCounts);
    }
  };

  return (
    <Animated.View
      style={[
        { position: 'absolute', zIndex: 1000 },
        (isMinimized && !isInPip)
          ? { left: miniPan.x, top: miniPan.y, width: 220, height: 220 * 9 / 16, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }
          : { top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#050505', paddingTop: (isFullscreen || isInPip) ? 0 : Math.max(insets.top, 24) }
      ]}
      {...((isMinimized && !isInPip) ? miniPlayerPanResponder.panHandlers : {})}
    >
      {/* Hide status bar only in fullscreen mode */}
      <StatusBar hidden={isFullscreen} translucent={true} backgroundColor="transparent" barStyle="light-content" />

      {/* ── VIDEO PLAYER ─────────────────────────────────────────────────────────── */}
      <View style={[
        S.videoOuter,
        isFullscreen && { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, zIndex: 1000 },
        prefs.ambientMode && !isInPip && { shadowColor: '#fff', shadowOpacity: 0.15, shadowRadius: 40, elevation: 30 },
        // When in native PiP, expand the video to fill the entire window (OS clips it)
        isInPip && { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', zIndex: 9999 },
      ]}>
        {isStreamLoading ? (
          <View style={S.videoInner}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 12 }}>Loading stream...</Text>
          </View>
        ) : streamUrl ? (
          <View style={{ flex: 1 }}>
            <WebView
              ref={webviewRef}
              source={streamUrl}
              style={{ flex: 1, backgroundColor: '#000' }}
              allowsFullscreenVideo
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              onLoadEnd={() => setIsVideoLoading(false)}
              injectedJavaScript={`
                (function() {
                  // Handle messages from React Native -> WebView
                  var _rnwListener = function(event) {
                    try {
                      var msg = JSON.parse(event.data);
                      var video = document.querySelector('video');
                      if (!video) return;
                      if (msg.type === 'setSpeed') {
                        video.playbackRate = msg.value;
                      }
                    } catch(e) {}
                  };
                  window.addEventListener('message', _rnwListener);
                  document.addEventListener('message', _rnwListener);

                  if ('mediaSession' in navigator) {
                    try {
                      navigator.mediaSession.metadata = new MediaMetadata({
                        title: 'Kaizoku Stream',
                        artist: 'Kaizoku'
                      });
                      navigator.mediaSession.setActionHandler('play', function() {
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mediaSessionPlay' }));
                      });
                      navigator.mediaSession.setActionHandler('pause', function() {
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mediaSessionPause' }));
                      });
                    } catch(e) {}
                  }
                })();
                true;
              `}
              javaScriptEnabled
              originWhitelist={['*']}
              mixedContentMode="always"
              onMessage={(e) => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data);
                  if (msg.type === 'openSettings') {
                    setActiveMenu('main');
                    setIsSettingsOpen(true);
                  } else if (msg.type === 'goBack') {
                    if (isFullscreenRef.current) {
                      toggleFullscreenState(false);
                    } else {
                      close();
                    }
                  } else if (msg.type === 'toggleFullscreen') {
                    toggleFullscreenState();
                  } else if (msg.type === 'ended') {
                    if (prefs.autoNext && currentEpIdx + 1 < episodes.length) {
                      changeEpisode(currentEpIdx + 1);
                    }
                    toggleFullscreenState();
                  } else if (msg.type === 'nextEpisode') {
                    if (currentEpIdx + 1 < episodes.length) {
                      changeEpisode(currentEpIdx + 1);
                    }
                  } else if (msg.type === 'prevEpisode') {
                    if (currentEpIdx > 0) {
                      changeEpisode(currentEpIdx - 1);
                    }
                  } else if (msg.type === 'playbackState') {
                    setIsPlaying(msg.payload.playing);
                    isPlayingRef.current = msg.payload.playing;
                    if (msg.payload.playing && isControlsVisible) showControls();
                  } else if (msg.type === 'buffering') {
                    setIsBuffering(msg.payload);
                  } else if (msg.type === 'loaded') {
                    setDuration(msg.payload.duration);
                    durationRef.current = msg.payload.duration;
                    setIsVideoLoading(false);
                    showControls();
                  } else if (msg.type === 'timeUpdate' && msg.payload) {
                    if (!isScrubbingRef.current) {
                      setCurrentTime(msg.payload.time);
                    }
                    if (msg.payload.duration) {
                      setDuration(msg.payload.duration);
                      durationRef.current = msg.payload.duration;
                    }
                    if (msg.payload.buffered !== undefined) setBufferedTime(msg.payload.buffered);
                    setShowSkip(msg.payload.showSkip);
                    setSkipTarget(msg.payload.skipTarget);
                    setSkipText(msg.payload.skipText);

                    if (prefs.autoSkip && msg.payload.showSkip && msg.payload.skipTarget > 0 && lastSkippedTargetRef.current !== msg.payload.skipTarget) {
                      lastSkippedTargetRef.current = msg.payload.skipTarget;
                      webviewRef.current.postMessage(JSON.stringify({ type: 'seek', value: msg.payload.skipTarget }));
                      setShowSkip(false);
                    }

                    progressRef.current = { time: msg.payload.time, duration: msg.payload.duration };
                    const now = Date.now();
                    if (!progressRef.current._lastSave || now - progressRef.current._lastSave > 15000) {
                      progressRef.current._lastSave = now;
                      updateProgress({ animeId, episodeIndex: currentEpIdx, progress: msg.payload.time, duration: msg.payload.duration });
                    }
                  } else if (msg.type === 'error') {
                    setIsVideoLoading(false);
                    setIsStreamLoading(false);
                    setStreamUrl(null); // Force error state
                  } else if (msg.type === 'controlsVisibility') {
                    setIsControlsVisible(msg.payload);
                  } else if (msg.type === 'mediaSessionPlay') {
                    togglePlayPause(true);
                  } else if (msg.type === 'mediaSessionPause') {
                    togglePlayPause(false);
                  } else if (msg.type === 'qualities') {
                    const rawLevels = Array.isArray(msg.payload) ? msg.payload : (msg.payload?.levels || []);
                    const seen = new Set();
                    const filtered = [];

                    rawLevels.forEach((l, idx) => {
                      let h = l.height || 0;
                      // Fallback if HLS assigns same height to multiple levels due to fake bitrates
                      if (seen.has(h)) {
                        const stds = [1080, 720, 480, 360, 240];
                        h = stds[idx] || (h - 1);
                        while (seen.has(h)) h -= 1;
                      }
                      seen.add(h);
                      filtered.push({ ...l, height: h });
                    });

                    // If HLS provided only 1 level, but server provided multiple quality URLs in allSources
                    if (filtered.length <= 1 && chosenAllSourcesRef.current?.length > 1) {
                      chosenAllSourcesRef.current.forEach((s, i) => {
                        const match = (s.label || '').match(/(\d{3,4})/);
                        const h = match ? parseInt(match[1], 10) : (1080 - i * 240);
                        if (!seen.has(h)) {
                          seen.add(h);
                          filtered.push({ height: h, index: i, fileUrl: s.file });
                        }
                      });
                    }

                    filtered.sort((a, b) => (b.height || 0) - (a.height || 0));
                    const levels = [{ height: 'Auto', index: -1 }, ...filtered];

                    // Only update qualityLevels if new list has MORE or EQUAL levels
                    // (prevents HLS level-locking from wiping out the parsed list)
                    setQualityLevels(prev => (levels.length >= prev.length ? levels : prev));

                    if (prefs.defaultQuality) {
                      const target = levels.find(l => String(l.height) === String(prefs.defaultQuality));
                      if (target) {
                        setCurrentQuality(target.index);
                        // Do not postMessage setQuality here as it triggers HLS.js level-locking
                      }
                    }
                  }
                } catch (_) { }
              }}
            />

            {/* Miniplayer Controls */}
            {isMinimized && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent', zIndex: 20, elevation: 20 }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  maximize();
                }} />
                <TouchableOpacity style={{ position: 'absolute', top: 6, right: 6, padding: 6, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12 }} onPress={close}>
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={{ position: 'absolute', bottom: 6, right: 6, padding: 6, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12 }} onPress={togglePlayPause}>
                  <Ionicons name={isPlaying ? "pause" : "play"} size={16} color="#fff" style={{ marginLeft: isPlaying ? 0 : 2 }} />
                </TouchableOpacity>
              </View>
            )}

            {/* Gesture Layer */}
            {!isInPip && !isMinimized && (
              <View style={[StyleSheet.absoluteFill, { zIndex: 5, backgroundColor: 'rgba(0,0,0,0.01)' }]} {...panResponder.panHandlers} />
            )}

            {/* UI Layer */}
            {!isInPip && !isMinimized && (
              <Animated.View
                pointerEvents={isControlsVisible ? 'auto' : 'none'}
                style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'space-between', opacity: controlsOpacity }]}
                {...panResponder.panHandlers}
              >

                {/* Modern Top Bar */}
                <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={[S.nativeTopBar, { paddingTop: isFullscreen ? Math.max(insets.top, 16) : 10, paddingLeft: Math.max(insets.left, 8), paddingRight: Math.max(insets.right, 8) }]} pointerEvents="box-none">
                  <TouchableOpacity onPress={handleBackPress} style={S.blurBtn}>
                    <Ionicons name="chevron-down" size={28} color="#fff" />
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity style={S.blurBtn} onPress={() => toggleSubtitles(!subtitlesEnabled)}>
                      {subtitlesEnabled ? (
                        <View style={{ backgroundColor: '#fff', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1.5, justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>CC</Text>
                        </View>
                      ) : (
                        <View style={{ borderWidth: 1.5, borderColor: '#fff', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1.5, justifyContent: 'center', alignItems: 'center', opacity: 0.6 }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>CC</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setActiveMenu('main'); setIsSettingsOpen(true); }} style={S.blurBtn}>
                      <Ionicons name="settings-outline" size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </LinearGradient>

                {/* Massive Center Controls */}
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="box-none">
                  {isBuffering ? (
                    <ActivityIndicator size={60} color="#FF0000" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: isFullscreen ? 60 : 36 }}>
                      <TouchableOpacity onPress={() => currentEpIdx > 0 && changeEpisode(currentEpIdx - 1)} style={{ padding: 10 }} disabled={currentEpIdx === 0}>
                        <Ionicons name="play-skip-back" size={isFullscreen ? 36 : 26} color="#fff" style={{ opacity: currentEpIdx > 0 ? 1 : 0.4 }} />
                      </TouchableOpacity>

                      <TouchableOpacity onPress={togglePlayPause} activeOpacity={0.7} style={{ padding: 10 }}>
                        <Ionicons name={isPlaying ? "pause" : "play"} size={isFullscreen ? 60 : 44} color="#fff" style={{ marginLeft: isPlaying ? 0 : (isFullscreen ? 4 : 3) }} />
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => currentEpIdx + 1 < (episodes?.length || 0) && changeEpisode(currentEpIdx + 1)} style={{ padding: 10 }} disabled={currentEpIdx + 1 >= (episodes?.length || 0)}>
                        <Ionicons name="play-skip-forward" size={isFullscreen ? 36 : 26} color="#fff" style={{ opacity: currentEpIdx + 1 < (episodes?.length || 0) ? 1 : 0.4 }} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Full-width Bottom Controls */}
                <View style={{ position: 'absolute', bottom: isFullscreen ? Math.max(insets.bottom, 24) : 0, left: 0, right: 0 }} pointerEvents="box-none">
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16), paddingBottom: 10, zIndex: 10 }}>
                    {/* YouTube Style Time Pill */}
                    <View style={S.timePillContainer}>
                      <Text style={S.timePillCurrent}>
                        {formatTime(isScrubbing ? scrubTime : currentTime)}
                      </Text>
                      <Text style={S.timePillSep}> / </Text>
                      <Text style={S.timePillDuration}>
                        {formatTime(duration)}
                      </Text>
                    </View>

                    <TouchableOpacity onPress={() => toggleFullscreenState()} style={{ padding: 4 }}>
                      <Ionicons name={isFullscreen ? "contract" : "expand"} size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  <View style={[S.nativeProgressBarContainer, { width: '100%', paddingLeft: isFullscreen ? Math.max(insets.left, 16) : 0, paddingRight: isFullscreen ? Math.max(insets.right, 16) : 0 }]} {...scrubPanResponder.panHandlers}>
                    <View style={{ flex: 1 }} pointerEvents="none">
                      <View style={S.nativeProgressTrack} />
                      <View style={[S.nativeProgressBuffered, { width: `${duration > 0 ? Math.min(100, (bufferedTime / duration) * 100) : 0}%` }]} />

                      {introData && duration > 0 && (
                        <View style={{ position: 'absolute', bottom: 0, height: 2, backgroundColor: 'rgba(252, 165, 109, 0.6)', left: `${(introData.start / duration) * 100}%`, width: `${((introData.end - introData.start) / duration) * 100}%`, borderRadius: 2 }} />
                      )}
                      {outroData && duration > 0 && (
                        <View style={{ position: 'absolute', bottom: 0, height: 2, backgroundColor: 'rgba(252, 165, 109, 0.6)', left: `${(outroData.start / duration) * 100}%`, width: `${((outroData.end - outroData.start) / duration) * 100}%`, borderRadius: 2 }} />
                      )}

                      <View style={[S.nativeProgressFill, { width: `${duration > 0 ? Math.min(100, ((isScrubbing ? scrubTime : currentTime) / duration) * 100) : 0}%` }]} />
                      <View style={[S.nativeProgressDot, { left: `${duration > 0 ? Math.min(100, ((isScrubbing ? scrubTime : currentTime) / duration) * 100) : 0}%`, marginLeft: -6 }]} />
                    </View>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Skip Accumulator Overlay */}
            {skipAccumulator !== 0 && (
              <View style={[StyleSheet.absoluteFill, { zIndex: 20, pointerEvents: 'none', justifyContent: 'center', alignItems: skipAccumulator > 0 ? 'flex-end' : 'flex-start', paddingLeft: Math.max(insets.left, 60), paddingRight: Math.max(insets.right, 60) }]}>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 40, padding: 20, alignItems: 'center' }}>
                  <Ionicons name={skipAccumulator > 0 ? 'play-forward' : 'play-back'} size={32} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 8 }}>
                    {skipAccumulator > 0 ? `+${skipAccumulator}s` : `${skipAccumulator}s`}
                  </Text>
                </View>
              </View>
            )}

            {/* Hold-to-2x Speed Overlay — small pill at top-center */}
            {!isInPip && !isMinimized && isHoldingSpeed && (
              <View style={[StyleSheet.absoluteFill, { zIndex: 25, pointerEvents: 'none', justifyContent: 'flex-start', alignItems: 'center', paddingTop: 16 }]}>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="flash" size={12} color="#fbbf24" />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>2×</Text>
                </View>
              </View>
            )}

            {/* Skip Intro Button */}
            {!isInPip && !isMinimized && showSkip && (
              <TouchableOpacity style={[S.nativeSkipBtn, { bottom: Math.max(insets.bottom, isFullscreen ? 60 : 50), right: Math.max(insets.right, 20) }]} onPress={() => {
                if (webviewRef.current) webviewRef.current.postMessage(JSON.stringify({ type: 'seek', value: skipTarget }));
                setShowSkip(false);
              }}>
                <Text style={S.nativeSkipText}>{skipText}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={S.videoInner}>
            <Ionicons name="videocam-off-outline" size={32} color="#4b5563" style={{ marginBottom: 12 }} />
            <Text style={{ color: '#6b7280', fontSize: 14 }}>Stream not available for {playingTitle}</Text>
          </View>
        )}
      </View>

      {/* ── SCROLLABLE CONTENT — hidden while in native PiP bubble or in-app miniplayer ────────────── */}
      {
        !isFullscreen && !isInPip && !isMinimized && (
          <View style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} stickyHeaderIndices={[1]}>
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>

                {/* Episode title (Clickable for Description) */}
                <TouchableOpacity activeOpacity={0.7} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setIsDescOpen(true); }} style={{ marginBottom: 16 }}>
                  <Text style={S.epMainTitle}>{playingTitle}</Text>
                  <Text style={S.epMeta}>
                    8.6K views • {currentEp?.air_date ? getTimeAgo(currentEp.air_date) : '3 days ago'} • #59 trending  <Text style={{ color: '#fff', fontWeight: 'bold' }}>...more</Text>
                  </Text>
                </TouchableOpacity>

                {/* Show info row */}
                <View style={S.showRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <Image source={{ uri: coverImage }} style={S.showAvatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={S.showTitle} numberOfLines={1}>{animeTitle}</Text>
                      <Text style={S.showSubs}>5.1K users</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={[S.addListBtn, savedStatus && { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' }]} onPress={() => setIsSaveMenuOpen(true)}>
                    <Text style={[S.addListText, savedStatus && { color: '#fff' }]}>{savedStatus || 'Add to List'}</Text>
                  </TouchableOpacity>
                </View>

                {/* Action buttons */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {/* Like/Dislike */}
                    <View style={S.likeGroup}>
                      <TouchableOpacity style={S.likeBtn} onPress={() => handleReaction('like')} activeOpacity={0.7}>
                        <Ionicons name={userReaction === 'like' ? "thumbs-up" : "thumbs-up-outline"} size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 13, marginLeft: 6, fontWeight: '600' }}>{reactionCounts.likes > 0 ? reactionCounts.likes : 'Like'}</Text>
                      </TouchableOpacity>
                      <View style={{ width: 1, backgroundColor: '#333' }} />
                      <TouchableOpacity style={S.likeBtn} onPress={() => handleReaction('dislike')} activeOpacity={0.7}>
                        <Ionicons name={userReaction === 'dislike' ? "thumbs-down" : "thumbs-down-outline"} size={18} color="#fff" />
                        {reactionCounts.dislikes > 0 && <Text style={{ color: '#fff', fontSize: 13, marginLeft: 6, fontWeight: '600' }}>{reactionCounts.dislikes}</Text>}
                      </TouchableOpacity>
                    </View>
                    {/* Dub */}
                    <TouchableOpacity
                      style={[S.actionChip, activeType === 'dub' && S.actionChipActive]}
                      onPress={toggleDub}
                    >
                      <Ionicons name="mic-outline" size={18} color={activeType === 'dub' ? '#000' : '#fff'} />
                      <Text style={[S.actionChipText, activeType === 'dub' && { color: '#000' }]}>Dub</Text>
                    </TouchableOpacity>
                    {/* Server */}
                    <TouchableOpacity
                      style={S.actionChip}
                      onPress={() => { setActiveMenu('server'); setIsSettingsOpen(true); }}
                    >
                      <Ionicons name="desktop-outline" size={18} color="#fff" />
                      <Text style={S.actionChipText}>Server</Text>
                    </TouchableOpacity>
                    {/* Share */}
                    <TouchableOpacity style={S.actionChip}>
                      <Ionicons name="share-social-outline" size={18} color="#fff" />
                      <Text style={S.actionChipText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>

                {/* Warning banner */}
                {showServerWarning && (
                  <View style={S.warningBanner}>
                    <Ionicons name="alert-circle-outline" size={18} color="#fca56d" style={{ marginTop: 2, flexShrink: 0 }} />
                    <Text style={S.warningText}>
                      If the current server doesn't work, feel free to try the other available servers.
                    </Text>
                    <TouchableOpacity onPress={() => setShowServerWarning(false)}>
                      <Ionicons name="close" size={16} color="#fca56d" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* ── COMMENTS PREVIEW ── */}
                <TouchableOpacity
                  style={{ backgroundColor: '#1c1d22', borderRadius: 14, padding: 16, marginBottom: 20, marginHorizontal: 0 }}
                  onPress={() => setIsCommentsOpen(true)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: topComment ? 12 : 0 }}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Comments</Text>
                    <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '500', marginLeft: 6 }}>{commentCount}</Text>
                  </View>

                  {topComment ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {topComment.photoURL ? (
                        <Image source={{ uri: topComment.photoURL }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#2a2a2a' }} />
                      ) : (
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{(topComment.displayName || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <Text style={{ color: '#d1d5db', fontSize: 13, flex: 1 }} numberOfLines={1}>
                        {topComment.spoiler ? 'Spoiler comment' : topComment.text}
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>No comments yet</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Tabs (Sticky) */}
              <View style={{ backgroundColor: '#050505', zIndex: 10, paddingHorizontal: 16, paddingTop: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
                    {['Episodes', 'Related', 'More like this', 'Recently Up'].map(tab => (
                      <TouchableOpacity
                        key={tab}
                        onPress={() => setActiveTab(tab)}
                        style={[S.tabChip, activeTab === tab && S.tabChipActive]}
                      >
                        <Text style={[S.tabChipText, activeTab === tab && S.tabChipTextActive]}>{tab}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Tabs Content */}
              <View style={{ paddingHorizontal: 16 }}>

                {/* ── EPISODES TAB ─────────────────────────────────────────────────── */}
                {activeTab === 'Episodes' && (
                  <View>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <View style={S.epCountBadge}>
                        <Text style={S.epCountText}>{episodes.length || 2} Episodes</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity style={S.epActionBtn} onPress={fetchStream}>
                          <Ionicons name="refresh-outline" size={16} color="#9ca3af" />
                        </TouchableOpacity>
                        <TouchableOpacity style={S.epActionBtn} onPress={() => { setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); setEpisodePage(0); }}>
                          <Ionicons name="swap-vertical-outline" size={16} color={sortOrder === 'desc' ? '#fff' : '#9ca3af'} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {episodes.length === 0 ? (
                      <View style={S.emptyState}>
                        <Text style={S.emptyTitle}>Episodes loading...</Text>
                        <Text style={S.emptySub}>Go back to Details to load episodes first.</Text>
                      </View>
                    ) : (
                      pagedEps.map((ep, idx) => {
                        const originalIndex = episodes.findIndex(e => e === ep);
                        return (
                          <EpisodeCard
                            key={ep.id || idx}
                            ep={ep}
                            isActive={originalIndex === currentEpIdx}
                            coverImage={coverImage}
                            onPress={() => changeEpisode(originalIndex)}
                          />
                        );
                      })
                    )}

                    {/* Pagination */}
                    {totalEpPages > 1 && (
                      <View style={S.pagination}>
                        <TouchableOpacity style={S.pageBtn} onPress={() => setEpisodePage(0)} disabled={episodePage === 0}>
                          <Text style={S.pageBtnText}>{'<<'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={S.pageBtn} onPress={() => setEpisodePage(p => Math.max(0, p - 1))} disabled={episodePage === 0}>
                          <Text style={S.pageBtnText}>{'<'}</Text>
                        </TouchableOpacity>
                        <View style={S.pageNum}>
                          <Text style={S.pageNumText}>{episodePage + 1} / {totalEpPages}</Text>
                        </View>
                        <TouchableOpacity style={S.pageBtn} onPress={() => setEpisodePage(p => Math.min(totalEpPages - 1, p + 1))} disabled={episodePage === totalEpPages - 1}>
                          <Text style={S.pageBtnText}>{'>'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={S.pageBtn} onPress={() => setEpisodePage(totalEpPages - 1)} disabled={episodePage === totalEpPages - 1}>
                          <Text style={S.pageBtnText}>{'>>'}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}

                {/* ── RELATED TAB ──────────────────────────────────────────────────── */}
                {activeTab === 'Related' && (
                  <View>
                    {relations.length > 0 ? relations.map(rel => (
                      <TouchableOpacity
                        key={`rel-${rel.id}`}
                        style={S.relCard}
                        onPress={() => navigation.navigate('Details', { animeId: rel.id })}
                        activeOpacity={0.85}
                      >
                        <Image source={{ uri: rel.coverImage }} style={S.relImg} resizeMode="cover" />
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          <Text style={S.relType}>{rel.relationType}</Text>
                          <Text style={S.relTitle} numberOfLines={1}>{rel.title}</Text>
                          <Text style={S.relMeta}>{rel.format}  {rel.year}</Text>
                        </View>
                      </TouchableOpacity>
                    )) : (
                      <View style={S.emptyState}>
                        <Text style={S.emptyTitle}>No related media found.</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* ── MORE LIKE THIS TAB ────────────────────────────────────────────── */}
                {activeTab === 'More like this' && (
                  <View>
                    {recommendations.length > 0 ? recommendations.map(rec => (
                      <TouchableOpacity
                        key={`rec-${rec.id}`}
                        style={S.relCard}
                        onPress={() => navigation.navigate('Details', { animeId: rec.id })}
                        activeOpacity={0.85}
                      >
                        <Image source={{ uri: rec.coverImage }} style={[S.relImg, { width: 72, height: 100 }]} resizeMode="cover" />
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          <Text style={S.relTitle} numberOfLines={2}>{rec.title}</Text>
                          <Text style={S.relMeta}>{[rec.format, rec.season, rec.year].filter(Boolean).join('  ')}</Text>
                        </View>
                      </TouchableOpacity>
                    )) : (
                      <View style={S.emptyState}>
                        <Text style={S.emptyTitle}>No recommendations found.</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* ── RECENTLY UP TAB ─────────────────────────────────────────────── */}
                {activeTab === 'Recently Up' && (
                  <View style={{ paddingTop: 8 }}>
                    {isRecentLoading ? (
                      <View style={{ paddingVertical: 20 }}>
                        <ActivityIndicator size="small" color="#fca56d" />
                      </View>
                    ) : recentReleases.length > 0 ? (
                      recentReleases.map((item, idx) => (
                        <VideoReleaseCard
                          key={`${item.id}_${idx}`}
                          anime={item}
                          onPress={() => play({
                            animeId: item.id,
                            animeTitle: item.title,
                            coverImage: item.image,
                            episodeIndex: item.epIndex
                          })}
                        />
                      ))
                    ) : (
                      <View style={S.emptyState}>
                        <Text style={S.emptyTitle}>No recent episodes found.</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* ── DESCRIPTION SHEET (Not a Modal) ── */}
            {internalDescOpen && (
              <Animated.View {...descPanResponder.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0f0f0f', borderTopLeftRadius: 16, borderTopRightRadius: 16, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.5, shadowRadius: 10, transform: [{ translateY: descSlideY }] }}>
                {/* Drag Handle and Header Wrapper */}
                <View style={{ backgroundColor: 'transparent' }}>
                  {/* Drag Handle */}
                  <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
                    <View style={{ width: 40, height: 4, backgroundColor: '#374151', borderRadius: 2 }} />
                  </View>

                  {/* Header */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Description</Text>
                    <TouchableOpacity onPress={() => closeDescription()}>
                      <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ padding: 16 }}
                  onScroll={(e) => { descScrollY.current = e.nativeEvent.contentOffset.y; }}
                  scrollEventThrottle={16}
                >
                  {/* Stats Row */}
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                    <View style={S.descStatBox}>
                      <Text style={S.descStatVal}>{reactionCounts.likes}</Text>
                      <Text style={S.descStatLabel}>Likes</Text>
                    </View>
                    <View style={S.descStatBox}>
                      <Text style={S.descStatVal}>{reactionCounts.dislikes}</Text>
                      <Text style={S.descStatLabel}>Dislikes</Text>
                    </View>
                    <View style={S.descStatBox}>
                      <Text style={S.descStatVal}>{currentEp?.air_date ? new Date(currentEp.air_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Apr 3'}</Text>
                      <Text style={S.descStatLabel}>{currentEp?.air_date ? new Date(currentEp.air_date).getFullYear() : '2026'}</Text>
                    </View>
                  </View>

                  {/* Episode Description */}
                  <Text style={{ color: '#d1d5db', fontSize: 14, lineHeight: 22, marginBottom: 24 }}>
                    {currentEp?.overview || 'No description available for this episode.'}
                  </Text>

                  {/* Anime Info */}
                  <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
                    <Image source={{ uri: coverImage }} style={{ width: 80, height: 120, borderRadius: 8 }} resizeMode="cover" />
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>{animeTitle}</Text>
                      <Text style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic', marginBottom: 8 }}>
                        {nativeTitle || animeTitle}
                      </Text>
                    </View>
                  </View>

                  <Text style={{ color: '#d1d5db', fontSize: 14, lineHeight: 22, marginBottom: 24 }}>
                    {description ? description.replace(/<[^>]+>/g, '') : 'No series description available.'}
                  </Text>

                  {/* Genres */}
                  {genres && genres.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 40 }}>
                      {genres.map(g => (
                        <View key={g} style={S.descGenreChip}>
                          <Text style={S.descGenreText}>{g}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </ScrollView>
              </Animated.View>
            )}

            {/* ── COMMENTS SHEET (Inline) ── */}
            <CommentsSheet
              visible={isCommentsOpen}
              onClose={() => setIsCommentsOpen(false)}
              animeId={animeId}
              animeTitle={animeTitle}
              epNum={episodes[currentEpIdx]?.number || (currentEpIdx + 1)}
              asModal={false}
            />
          </View>
        )}

      {/* ── SETTINGS MODAL ─────────────────────────────────────────────────── */}
      {
        !isInPip && internalSettingsOpen && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 9999, justifyContent: 'flex-end', alignItems: isFullscreen ? 'center' : 'stretch' }]}>
            <TouchableWithoutFeedback onPress={() => closeSettings()}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
            </TouchableWithoutFeedback>
            <Animated.View {...settingsPanResponder.panHandlers} style={[S.settingsSheet, isFullscreen && { width: 450, borderRadius: 16, marginBottom: 20, maxHeight: '90%' }, { transform: [{ translateY: settingsSlideY }] }]}>
              {/* Drag handle */}
              <View style={S.settingsHandleWrap}><View style={S.settingsHandle} /></View>
              <ScrollView
                style={{ flexShrink: 1, flexGrow: 1, width: '100%', maxHeight: '100%' }}
                contentContainerStyle={{ paddingBottom: isFullscreen ? 40 : 20 }}
                showsVerticalScrollIndicator={true}
                indicatorStyle="white"
                bounces={false}
                nestedScrollEnabled={true}
                onScroll={(e) => { settingsScrollY.current = e.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={16}
              >

                {/* ── MAIN MENU ── */}
                {activeMenu === 'main' && (
                  <View style={{ marginTop: 4, gap: 2 }}>
                    {/* Dub toggle */}
                    <TouchableOpacity style={S.settingsRow} onPress={toggleDub} activeOpacity={0.7}>
                      <Ionicons name="mic-outline" size={20} color="#9ca3af" />
                      <Text style={S.settingsRowText}>Dub</Text>
                      <View style={{ flex: 1 }} />
                      <View style={[S.toggleTrack, activeType === 'dub' && S.toggleTrackOn]}>
                        <View style={[S.toggleThumb, activeType === 'dub' && S.toggleThumbOn]} />
                      </View>
                    </TouchableOpacity>
                    {/* Audio */}
                    <View style={S.settingsRow}>
                      <Ionicons name="musical-notes-outline" size={20} color="#9ca3af" />
                      <Text style={S.settingsRowText}>Audio</Text>
                      <View style={{ flex: 1 }} />
                      <Text style={S.settingsRowValue}>Original</Text>
                    </View>
                    {/* Speed */}
                    <TouchableOpacity style={S.settingsRow} onPress={() => setActiveMenu('speed')} activeOpacity={0.7}>
                      <Ionicons name="speedometer-outline" size={20} color="#9ca3af" />
                      <Text style={S.settingsRowText}>Playback speed</Text>
                      <View style={{ flex: 1 }} />
                      <Text style={S.settingsRowValue}>{playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#6b7280" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                    {/* Subtitles */}
                    <TouchableOpacity style={S.settingsRow} onPress={() => setActiveMenu('subtitles')} activeOpacity={0.7}>
                      <Ionicons name="chatbox-ellipses-outline" size={20} color="#9ca3af" />
                      <Text style={S.settingsRowText}>Subtitles/CC</Text>
                      <View style={{ flex: 1 }} />
                      <Text style={S.settingsRowValue}>{subtitlesEnabled ? selectedSubtitleLabel : 'Off'}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#6b7280" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                    {/* Quality */}
                    <TouchableOpacity style={S.settingsRow} onPress={() => setActiveMenu('quality')} activeOpacity={0.7}>
                      <Ionicons name="videocam-outline" size={20} color="#9ca3af" />
                      <Text style={S.settingsRowText}>Quality</Text>
                      <View style={{ flex: 1 }} />
                      <Text style={S.settingsRowValue}>
                        {(() => {
                          const sq = qualityLevels.find(q => q.index === currentQuality);
                          return sq ? (sq.height === 'Auto' ? 'Auto' : `${sq.height}p`) : 'Auto';
                        })()}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color="#6b7280" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                    {/* Server */}
                    <TouchableOpacity style={S.settingsRow} onPress={() => setActiveMenu('server')} activeOpacity={0.7}>
                      <Ionicons name="desktop-outline" size={20} color="#9ca3af" />
                      <Text style={S.settingsRowText}>Server</Text>
                      <View style={{ flex: 1 }} />
                      <Text style={S.settingsRowValue}>{currentServer || 'Default'}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#6b7280" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                    {/* More */}
                    <TouchableOpacity style={S.settingsRow} onPress={() => setActiveMenu('more')} activeOpacity={0.7}>
                      <Ionicons name="options-outline" size={20} color="#9ca3af" />
                      <Text style={S.settingsRowText}>More</Text>
                      <View style={{ flex: 1 }} />
                      <Ionicons name="chevron-forward" size={16} color="#6b7280" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  </View>
                )}

                {/* ── SPEED SUBMENU ── */}
                {activeMenu === 'speed' && (
                  <View>
                    <View style={S.settingsSubHeader}>
                      <TouchableOpacity onPress={() => setActiveMenu('main')} style={{ padding: 4, marginRight: 8 }}>
                        <Ionicons name="arrow-back" size={22} color="#e5e7eb" />
                      </TouchableOpacity>
                      <Text style={S.settingsSubHeaderText}>Playback speed</Text>
                    </View>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                      <TouchableOpacity key={s} style={S.settingsRow} onPress={() => handleSpeedChange(s)} activeOpacity={0.7}>
                        <View style={{ width: 28 }} />
                        <Text style={S.settingsRowText}>{s === 1 ? 'Normal' : `${s}x`}</Text>
                        <View style={{ flex: 1 }} />
                        {playbackSpeed === s && <Ionicons name="checkmark" size={20} color="#fff" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* ── QUALITY SUBMENU ── */}
                {activeMenu === 'quality' && (
                  <View>
                    <View style={S.settingsSubHeader}>
                      <TouchableOpacity onPress={() => setActiveMenu('main')} style={{ padding: 4, marginRight: 8 }}>
                        <Ionicons name="arrow-back" size={22} color="#e5e7eb" />
                      </TouchableOpacity>
                      <Text style={S.settingsSubHeaderText}>Quality</Text>
                    </View>
                    {/* Always show all quality levels — show a note if only Auto is available */}
                    {qualityLevels.map(q => {
                      const isSelected = currentQuality === q.index;
                      const isDefault = prefs.defaultQuality && String(q.height) === String(prefs.defaultQuality);
                      return (
                        <TouchableOpacity key={q.index} style={S.settingsRow} onPress={() => handleQualityChange(q)} activeOpacity={0.7}>
                          <View style={{ width: 28 }} />
                          <Text style={S.settingsRowText}>
                            {q.height === 'Auto' ? 'Auto' : `${q.height}p`}
                            {isDefault && <Text style={{ color: '#6b7280', fontSize: 12 }}> (Default)</Text>}
                          </Text>
                          <View style={{ flex: 1 }} />
                          {isSelected && <Ionicons name="checkmark" size={20} color="#fff" />}
                        </TouchableOpacity>
                      );
                    })}
                    {qualityLevels.length <= 1 && (
                      <View style={{ paddingHorizontal: 16, paddingBottom: 12, alignItems: 'center' }}>
                        <Text style={{ color: '#6b7280', fontSize: 12 }}>Additional quality levels load once the stream starts.</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* ── SUBTITLES SUBMENU ── */}
                {activeMenu === 'subtitles' && (
                  <View>
                    <View style={S.settingsSubHeader}>
                      <TouchableOpacity onPress={() => setActiveMenu('main')} style={{ padding: 4, marginRight: 8 }}>
                        <Ionicons name="arrow-back" size={22} color="#e5e7eb" />
                      </TouchableOpacity>
                      <Text style={S.settingsSubHeaderText}>Subtitles/CC</Text>
                    </View>
                    <TouchableOpacity style={S.settingsRow} onPress={() => toggleSubtitles(false)}>
                      <View style={{ width: 28 }} />
                      <Text style={S.settingsRowText}>Off</Text>
                      <View style={{ flex: 1 }} />
                      {!subtitlesEnabled && <Ionicons name="checkmark" size={20} color="#fff" />}
                    </TouchableOpacity>
                    {availableSubtitles.map((sub, idx) => {
                      const isSelected = subtitlesEnabled && selectedSubtitleLabel === sub.label;
                      return (
                        <TouchableOpacity key={`${sub.label}-${idx}`} style={S.settingsRow} onPress={() => toggleSubtitles(true, sub.label)}>
                          <View style={{ width: 28 }} />
                          <Text style={S.settingsRowText}>{sub.label}</Text>
                          <View style={{ flex: 1 }} />
                          {isSelected && <Ionicons name="checkmark" size={20} color="#fff" />}
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                )}

                {/* ── SERVER SUBMENU ── */}
                {activeMenu === 'server' && (
                  <View>
                    <View style={S.settingsSubHeader}>
                      <TouchableOpacity onPress={() => setActiveMenu('main')} style={{ padding: 4, marginRight: 8 }}>
                        <Ionicons name="arrow-back" size={22} color="#e5e7eb" />
                      </TouchableOpacity>
                      <Text style={S.settingsSubHeaderText}>Server</Text>
                    </View>
                    {streamData?.sources
                      ?.filter((s, i, arr) => arr.findIndex(x => x.server === s.server && x.type === s.type) === i)
                      ?.map(server => {
                        const isSelected = currentServer === server.server && activeType === (server.type === 'dub' ? 'dub' : 'sub');
                        return (
                          <TouchableOpacity key={`${server.server}-${server.type}`} style={S.settingsRow} onPress={() => handleServerChange(server.server, server.type)} activeOpacity={0.7}>
                            <View style={{ width: 28 }} />
                            <Text style={S.settingsRowText}>
                              {server.server} <Text style={{ color: '#6b7280', fontSize: 13, fontWeight: '500' }}>({server.type.toUpperCase()})</Text>
                            </Text>
                            <View style={{ flex: 1 }} />
                            {isSelected && <Ionicons name="checkmark" size={20} color="#fff" />}
                          </TouchableOpacity>
                        );
                      }) || (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                          <Text style={{ color: '#6b7280', fontSize: 13 }}>No servers available</Text>
                        </View>
                      )
                    }
                  </View>
                )}

                {/* ── MORE SUBMENU ── */}
                {activeMenu === 'more' && (
                  <View>
                    <View style={S.settingsSubHeader}>
                      <TouchableOpacity onPress={() => setActiveMenu('main')} style={{ padding: 4, marginRight: 8 }}>
                        <Ionicons name="arrow-back" size={22} color="#e5e7eb" />
                      </TouchableOpacity>
                      <Text style={S.settingsSubHeaderText}>More</Text>
                    </View>
                    {[
                      { key: 'autoPlay', label: 'Auto Play', icon: 'play-circle-outline' },
                      { key: 'autoNext', label: 'Auto Next', icon: 'play-forward-outline' },
                      { key: 'autoSkip', label: 'Auto Skip', icon: 'play-skip-forward-outline' },
                      { key: 'ambientMode', label: 'Ambient mode', icon: 'color-palette-outline' },
                      { key: 'miniplayer', label: 'Miniplayer', icon: 'albums-outline' },
                    ].map(opt => (
                      <TouchableOpacity key={opt.key} style={S.settingsRow} onPress={() => updatePrefs({ [opt.key]: !prefs[opt.key] })} activeOpacity={0.7}>
                        <Ionicons name={opt.icon} size={20} color="#9ca3af" />
                        <Text style={[S.settingsRowText, { color: '#e5e7eb', fontSize: 15, fontWeight: '500', marginLeft: 12 }]}>{opt.label}</Text>
                        <View style={{ flex: 1 }} />
                        <Switch
                          value={prefs[opt.key]}
                          onValueChange={() => updatePrefs({ [opt.key]: !prefs[opt.key] })}
                          trackColor={{ false: '#333', true: '#22c55e' }}
                          thumbColor={prefs[opt.key] ? '#fff' : '#999'}
                        />
                      </TouchableOpacity>
                    ))}
                    {/* Audio Boost slider */}
                    <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text style={{ color: '#e5e7eb', fontSize: 15, fontWeight: '500' }}>Audio Boost</Text>
                        <Text style={{ color: '#e5e7eb', fontSize: 15 }}>{prefs.audioBoost}%</Text>
                      </View>
                      <View
                        style={{ height: 32, justifyContent: 'center' }}
                        onStartShouldSetResponder={() => true}
                        onResponderMove={(e) => {
                          const w = Dimensions.get('window').width - 40;
                          let pct = e.nativeEvent.locationX / w;
                          pct = Math.max(0, Math.min(1, pct));
                          updatePrefs({ audioBoost: Math.round(pct * 200) });
                        }}
                        onResponderRelease={(e) => {
                          const w = Dimensions.get('window').width - 40;
                          let pct = e.nativeEvent.locationX / w;
                          pct = Math.max(0, Math.min(1, pct));
                          updatePrefs({ audioBoost: Math.round(pct * 200) });
                        }}
                      >
                        <View style={{ height: 4, backgroundColor: '#333', borderRadius: 2, pointerEvents: 'none' }}>
                          <View style={{ height: 4, width: `${Math.min(100, Math.max(0, (prefs.audioBoost || 100) / 2))}%`, backgroundColor: '#fff', borderRadius: 2 }} />
                          <View style={{ position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', left: `${Math.min(100, Math.max(0, (prefs.audioBoost || 100) / 2))}%`, marginLeft: -8, marginTop: -6 }} />
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                <View style={{ height: 24 }} />
              </ScrollView>
            </Animated.View>
          </View>
        )
      }

      {/* ── SAVE MENU MODAL ── */}
      <Modal visible={isSaveMenuOpen} transparent animationType="fade" onRequestClose={() => setIsSaveMenuOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableWithoutFeedback onPress={() => setIsSaveMenuOpen(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={S.saveMenu}>
            <Text style={S.saveMenuTitle}>Add to List</Text>
            {['Planning', 'Watching', 'On hold', 'Dropped', 'Finished', 'Rewatching'].map(status => (
              <TouchableOpacity key={status} style={S.saveMenuBtn} onPress={() => handleSaveStatus(status)}>
                <View style={S.saveMenuRadio}>
                  {savedStatus === status && <View style={S.saveMenuRadioInner} />}
                </View>
                <Text style={S.saveMenuBtnText}>{status}</Text>
              </TouchableOpacity>
            ))}
            {savedStatus && (
              <TouchableOpacity style={[S.saveMenuBtn, { marginTop: 8, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 16 }]} onPress={() => handleSaveStatus('Remove')}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" style={{ marginRight: 12 }} />
                <Text style={[S.saveMenuBtnText, { color: '#ef4444' }]}>Remove from List</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

    </Animated.View>
  );
}

export default function PlayerScreen() {
  const { playerState } = usePlayer();
  if (!playerState?.isActive || !playerState?.data) return null;
  return <PlayerScreenInner />;
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  videoOuter: {
    width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.8, shadowRadius: 30,
  },
  videoInner: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  playerHeaderOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0)',
  },
  playerHeaderBtn: { padding: 8 },
  epMainTitle: { color: '#f3f4f6', fontSize: 19, fontWeight: '700', lineHeight: 26, marginBottom: 4, letterSpacing: 0.3 },
  epMeta: { color: '#9ca3af', fontSize: 12, fontWeight: '500' },
  showRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  showAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222' },
  showTitle: { color: '#e5e7eb', fontSize: 13, fontWeight: '700' },
  showSubs: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  addListBtn: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 },
  addListText: { color: '#000', fontSize: 13, fontWeight: '700' },
  descStatBox: { flex: 1, backgroundColor: '#111827', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  descStatVal: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  descStatLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '500' },
  descGenreChip: { backgroundColor: '#06b6d4', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  descGenreText: { color: '#083344', fontSize: 12, fontWeight: '600' },
  likeGroup: {
    flexDirection: 'row', backgroundColor: '#1a1a1a', borderRadius: 999,
    borderWidth: 1, borderColor: '#2a2a2a', overflow: 'hidden',
  },
  likeBtn: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
  },
  actionChipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  actionChipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  warningBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#3b1d10', borderWidth: 1, borderColor: 'rgba(252,165,109,0.3)',
    borderRadius: 12, padding: 12, marginBottom: 20,
  },
  warningText: { color: '#fca56d', fontSize: 13, fontWeight: '500', lineHeight: 18, flex: 1 },
  tabChip: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
  },
  tabChipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  tabChipText: { color: '#d1d5db', fontSize: 13, fontWeight: '600' },
  tabChipTextActive: { color: '#000' },
  // Episode card
  epCard: {
    flexDirection: 'row', gap: 12, padding: 10,
    backgroundColor: '#0a0a0a', borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  epCardActive: { backgroundColor: '#1a100d', borderColor: '#4a2416' },
  epThumb: { width: 140, aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111', borderWidth: 1, borderColor: '#222' },
  epNumBadge: {
    position: 'absolute', top: 6, left: 6,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  epNumBadgeActive: { backgroundColor: '#fca56d' },
  epNumText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  epNumTextActive: { color: '#000' },
  epDuration: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  epDurationText: { color: '#d1d5db', fontSize: 10, fontWeight: '700' },
  playingOverlay: {
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  playBar: { width: 3, height: 14, backgroundColor: '#fca56d', borderRadius: 2 },
  epInfo: { flex: 1, justifyContent: 'center', paddingRight: 8, paddingVertical: 2 },
  epTitle: { color: '#f3f4f6', fontSize: 14, fontWeight: '700', marginBottom: 6, lineHeight: 18 },
  epTitleActive: { color: '#fca56d' },
  epOverview: { color: '#6b7280', fontSize: 11.5, lineHeight: 16 },
  epCountBadge: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  epCountText: { color: '#e5e7eb', fontSize: 12, fontWeight: '700' },
  epActionBtn: { padding: 6, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 999 },
  emptyState: {
    alignItems: 'center', paddingVertical: 40,
    backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: '#1a1a1a',
  },
  emptyTitle: { color: '#6b7280', fontSize: 14, fontWeight: '500' },
  emptySub: { color: '#4b5563', fontSize: 12, marginTop: 4 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24, marginTop: 8 },
  pageBtn: { padding: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10 },
  pageBtnText: { color: '#9ca3af', fontSize: 13 },
  pageNum: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#1a1a1a', borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a' },
  pageNumText: { color: '#e5e7eb', fontSize: 13, fontWeight: '700' },
  relCard: {
    flexDirection: 'row', gap: 16, padding: 8,
    backgroundColor: '#151515', borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  relImg: { width: 80, height: 80, borderRadius: 12, backgroundColor: '#222' },
  relType: { color: '#6b7280', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  relTitle: { color: '#e5e7eb', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  relMeta: { color: '#6b7280', fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  // Release Card
  releaseCard: { width: '100%', marginBottom: 16 },
  releaseThumbnail: {
    width: '100%', aspectRatio: 16 / 9,
    backgroundColor: '#111', borderRadius: 16,
    overflow: 'hidden', borderWidth: 1, borderColor: '#1a1a1a',
    marginBottom: 12,
  },
  releasePlayCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    margin: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  releaseEpBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  releaseEpBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  releaseInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  releaseAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222', borderWidth: 1, borderColor: '#222', flexShrink: 0 },
  releaseEpLabel: { color: '#e5e7eb', fontSize: 12, fontWeight: '700' },
  releaseTitle: { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  releaseTime: { color: '#6b7280', fontSize: 10, marginTop: 2 },
  // Settings Modal — matches React app CustomVideoPlayer style
  settingsSheet: {
    backgroundColor: 'rgba(28,28,30,0.97)',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 16, paddingTop: 10,
    maxHeight: '80%',
    flexShrink: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.5, shadowRadius: 20,
    elevation: 20,
  },
  settingsHandleWrap: { alignItems: 'center', paddingVertical: 10 },
  settingsHandle: { width: 48, height: 4, borderRadius: 2, backgroundColor: '#4b5563' },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 13, paddingHorizontal: 8, borderRadius: 12,
  },
  settingsRowText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  settingsRowValue: { color: '#9ca3af', fontSize: 14 },
  settingsSubHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 4,
  },
  settingsSubHeaderText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  // Dub toggle
  toggleTrack: { width: 42, height: 24, borderRadius: 12, backgroundColor: '#3f3f46', justifyContent: 'center', paddingHorizontal: 2 },
  toggleTrackOn: { backgroundColor: '#ffffff' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#a1a1aa' },
  toggleThumbOn: { backgroundColor: '#18181b', transform: [{ translateX: 18 }] },
  // Save Menu
  saveMenu: { width: 280, backgroundColor: '#111', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#222' },
  saveMenuTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  saveMenuBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  saveMenuRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#444', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  saveMenuRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d4c356' },
  saveMenuBtnText: { color: '#d1d5db', fontSize: 15, fontWeight: '500' },
  // Native Player Styles
  nativeTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 30 },
  blurBtn: { padding: 8 },
  giantPlayBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  floatingPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  nativeProgressBarContainer: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 24, justifyContent: 'flex-end', paddingBottom: 0, zIndex: 5 },
  nativeProgressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  nativeProgressBuffered: { position: 'absolute', left: 0, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.6)' },
  nativeProgressFill: { position: 'absolute', left: 0, bottom: 0, height: 2, backgroundColor: '#FF0000' },
  nativeProgressDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#FF0000', bottom: -5, zIndex: 5 },
  nativeSkipBtn: { position: 'absolute', zIndex: 15, backgroundColor: 'rgba(20,20,20,0.85)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  nativeSkipText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  centerPlayBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  timePillContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 12, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)',
  },
  timePillCurrent: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  timePillSep: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '500' },
  timePillDuration: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500' },
});
