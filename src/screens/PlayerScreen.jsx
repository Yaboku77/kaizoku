import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  Dimensions, ActivityIndicator, StatusBar, Alert, Modal, BackHandler, TouchableWithoutFeedback,
  LayoutAnimation, UIManager, Platform, Switch, Animated, PanResponder
} from 'react-native';
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
import { saveHistoryToCloud, updateProgressInCloud, saveListToCloud, removeFromListCloud, getCommentCount, getTopComment } from '../api/firestore';
import { scrapeSearch } from '../api/scrapers/search.scraper';
import { scrapeWatch } from '../api/scrapers/watch.scraper';
import CommentsSheet from './CommentsSheet';

const { width } = Dimensions.get('window');
const TMDB_KEY = TMDB_API_KEY || '3dfa4bae246f35044e56a6dcd3294e3f';
// Scraping runs locally on-device — no hosted proxy server needed
const EPISODES_PER_PAGE = 25;
// Preferred server order (from API: VidPlay-1, HD-1, Vidstream-2, VidCloud-1)
const PREFERRED_SERVERS = ['VidPlay-1', 'HD-1', 'Vidstream-2', 'VidCloud-1', 'Kiwi Stream'];

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
  const { playerState, minimize, maximize, close, play, prefs, updatePrefs } = usePlayer();
  const { isActive, isMinimized, data } = playerState;
  const { user } = useAuth();

  const {
    animeId,
    animeTitle,
    coverImage,
    nativeTitle,
    synonyms = [],
    description,
    genres = [],
    episodes: passedEpisodes = [],
    episodeIndex = 0,
    trailer,
    relations = [],
    recommendations = [],
  } = data;

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

  const screenHeight = Dimensions.get('window').height;
  const descSlideY = useRef(new Animated.Value(screenHeight)).current;

  const isMinimizedRef = useRef(isMinimized);
  isMinimizedRef.current = isMinimized;

  const miniPlayerPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const miniPos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const id = miniPlayerPosition.addListener((val) => {
      miniPos.current = val;
    });
    return () => miniPlayerPosition.removeListener(id);
  }, []);

  const miniPlayerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => isMinimizedRef.current && (Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5),
      onMoveShouldSetPanResponderCapture: (_, g) => isMinimizedRef.current && (Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5),
      onPanResponderMove: Animated.event(
        [null, { dx: miniPlayerPosition.x, dy: miniPlayerPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        miniPlayerPosition.flattenOffset();
        const dx = miniPos.current.x;
        const dy = miniPos.current.y;

        const screenW = Dimensions.get('window').width;
        const screenH = Dimensions.get('window').height;
        const playerW = 220;
        const playerH = 220 * (9 / 16);

        const maxX = 16;
        const minX = -(screenW - playerW - 16);
        const maxY = 70;
        const minY = -(screenH - playerH - 70 - (insets.top || 0));

        let newX = dx;
        let newY = dy;
        let bounce = false;

        if (dx > maxX) { newX = maxX; bounce = true; }
        else if (dx < minX) { newX = minX; bounce = true; }

        if (dy > maxY) { newY = maxY; bounce = true; }
        else if (dy < minY) { newY = minY; bounce = true; }

        if (bounce) {
          Animated.spring(miniPlayerPosition, {
            toValue: { x: newX, y: newY },
            useNativeDriver: false,
            friction: 6
          }).start(() => miniPlayerPosition.extractOffset());
        } else {
          miniPlayerPosition.extractOffset();
        }
      }
    })
  ).current;

  useEffect(() => {
    if (!isMinimized) {
      miniPlayerPosition.setValue({ x: 0, y: 0 });
      miniPlayerPosition.setOffset({ x: 0, y: 0 });
    }
  }, [isMinimized]);

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

  const descPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
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
      getCommentCount(animeId).then(n => setCommentCount(n));
      getTopComment(animeId).then(c => setTopComment(c));
    }
  }, [animeId]);

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
    const nextState = forceState !== undefined ? forceState : !isFullscreenRef.current;
    if (isFullscreenRef.current === nextState) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const isFullscreenRef = useRef(false);

  const webviewRef = useRef(null);
  const progressRef = useRef({ time: 0, duration: 0 }); // track without re-render

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
    getPlayerPrefs().then(prefs => {
      if (prefs.speed && prefs.speed !== 1) setPlaybackSpeed(prefs.speed);
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

  // Hardware back button handling for Android
  useEffect(() => {
    const backAction = () => {
      if (isFullscreenRef.current) {
        toggleFullscreenState(false);
        return true;
      }
      if (!isMinimized) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        minimize();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isMinimized, minimize]);

  // ── Fetch stream by scraping anikoto.net directly (no external API needed) ──
  // Flow: scrapeSearch → scrapeWatch → extractStreamUrl → m3u8 URL + referer
  //       HLS.js custom loader injects Referer header on every segment request
  const fetchStream = useCallback(async (forceType = null) => {
    setIsStreamLoading(true);
    setStreamUrl(null);
    setIsVideoLoading(true);
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
      const exactMatch = results.find(r => {
        const rName = (r.title || r.name || '').toLowerCase().trim();
        const rJname = (r.titleJp || '').toLowerCase().trim();
        return possibleTitles.includes(rName) || possibleTitles.includes(rJname) ||
          possibleTitles.some(t => rName.includes(t) || t.includes(rName));
      });
      if (exactMatch) bestMatch = exactMatch;

      const slug = bestMatch.slug || bestMatch.id;
      const epNum = currentEpIdx + 1;

      console.log(`[DEBUG] Calling scrapeWatch for slug: ${slug}, epNum: ${epNum}`);
      // 2. Get stream data — response has flat sources[] array, each with {server, type, url, m3u8, referer, proxyUrl, tracks}
      const data = await scrapeWatch(slug, String(epNum));

      if (data && data.sources?.length) {
        // Only consider sources that have an actual extracted m3u8 URL
        const validSources = data.sources.filter(s => s.m3u8);
        console.log(`[DEBUG] Found ${data.sources.length} total sources, ${validSources.length} with m3u8.`);
        data.sources.forEach(s => console.log(`[DEBUG] source: server=${s.server} type=${s.type} m3u8=${s.m3u8 ? 'YES' : 'NO'} referer=${s.referer || 'none'}`));
        setStreamData(data);

        const sources = validSources.length > 0 ? validSources : data.sources;
        let wantType = forceType || activeTypeRef.current;
        if (wantType === 'dub' && !data.episode?.hasDub) wantType = 'sub';

        const isValid = (s) => {
          // Must have an m3u8 URL to be playable
          if (!s.m3u8) return false;
          if (wantType === 'dub' && s.type === 'dub') {
            // Reject dub sources that have the same m3u8 as sub (they're identical streams)
            const subVer = sources.find(x => x.server === s.server && x.type === 'sub' && x.m3u8);
            if (subVer && s.m3u8 === subVer.m3u8) return false;
          }
          return true;
        };

        let chosen = null;
        if (currentServer) {
          chosen = sources.find(s => s.server === currentServer && s.type === wantType && isValid(s));
        }
        if (!chosen) {
          for (const pref of PREFERRED_SERVERS) {
            chosen = sources.find(s => s.server === pref && s.type === wantType && isValid(s));
            if (chosen) break;
          }
        }
        if (!chosen) {
          chosen = sources.find(s => s.type === wantType && isValid(s));
        }
        // Fallback: any source with a valid m3u8
        if (!chosen) {
          chosen = sources.find(s => isValid(s)) || sources.find(s => s.m3u8) || null;
        }

        if (chosen) {
          const resolvedType = chosen.type === 'dub' ? 'dub' : 'sub';
          setActiveType(resolvedType);
          activeTypeRef.current = resolvedType;
          if (!currentServer || currentServer !== chosen.server) setCurrentServer(chosen.server || '');
          const streamSrc = chosen.m3u8;
          const tracks = chosen.tracks || [];
          const initialTime = progressRef.current?.time || 0;
          let refererBase = 'https://anikoto.net/';
          try { if (chosen.referer) refererBase = new URL(chosen.referer).origin + '/'; } catch (e) { }
          console.log(`[DEBUG] Playing: server=${chosen.server} type=${chosen.type} m3u8=${streamSrc} referer=${chosen.referer} baseUrl=${refererBase}`);
          setStreamUrl({ html: buildPlayerHTML(streamSrc, chosen.referer || '', tracks, playbackSpeed, initialTime, subtitlesEnabledRef.current), baseUrl: refererBase });
        } else {
          console.log('[DEBUG] No source with valid m3u8 found. All extraction failed.');
        }
      } else {
        console.log('[DEBUG] scrapeWatch returned no sources at all.');
      }
    } catch (e) {
      console.log('Stream fetch error:', e);
    } finally {
      setIsStreamLoading(false);
    }
  }, [animeTitle, currentEpIdx, nativeTitle, synonyms, currentServer]);

  useEffect(() => { fetchStream(); }, [fetchStream]);

  useEffect(() => {
    setEpisodePage(Math.floor(currentEpIdx / EPISODES_PER_PAGE));
  }, [currentEpIdx]);

  // Build the player HTML with a HLS.js custom loader that adds Referer/Origin headers.
  // This eliminates the need for any external proxy — all HLS requests are made via
  // fetch() with the correct headers injected directly in the WebView.
  const buildPlayerHTML = (src, referer = '', tracks = [], initialSpeed = 1, initialTime = 0, initialSubtitles = true) => {
    const trackTags = (tracks || [])
      .filter(t => t.kind === 'captions' || t.kind === 'subtitles')
      .map((t, i) => {
        const trackSrc = t.file || t.url || '';
        return `<track kind="subtitles" src="${trackSrc}" label="${t.label || 'Sub'}" srclang="en" ${(i === 0 && initialSubtitles) ? 'default' : ''}>`;
      })
      .join('');

    const safeReferer = referer || '';
    const safeOrigin = (() => { try { return safeReferer ? new URL(safeReferer).origin : ''; } catch (_) { return ''; } })();

    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{width:100%;height:100%;background:#000;overflow:hidden;font-family:'Nunito',-apple-system,BlinkMacSystemFont,sans-serif;}
#vid{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;}
#loader{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
.spin{width:40px;height:40px;border:3px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:sp 0.8s linear infinite;}
@keyframes sp{to{transform:rotate(360deg);}}
#errbox{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#9ca3af;font-size:14px;text-align:center;padding:20px;}
#ov{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 35%,transparent 65%,rgba(0,0,0,0.7) 100%);opacity:0;transition:opacity 0.3s;pointer-events:none;}
#ov.show{opacity:1;pointer-events:auto;}
#topbar{position:relative;z-index:10;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;}
#ctrls{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:48px;pointer-events:none;}
.cbtn{pointer-events:auto;width:56px;height:56px;border-radius:50%;background:rgba(0,0,0,0.35);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);}
.cpbtn{pointer-events:auto;width:72px;height:72px;border-radius:50%;background:rgba(0,0,0,0.35);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);}
#botbar{position:relative;z-index:10;padding:0 16px 18px;display:flex;flex-direction:column;gap:8px;}
#timerow{display:flex;justify-content:space-between;align-items:center;color:#fff;font-size:12px;font-weight:500;}
#fsbtn{pointer-events:auto;background:none;border:none;color:#fff;cursor:pointer;padding:4px;line-height:0;}
#prog{pointer-events:auto;width:100%;height:5px;background:rgba(255,255,255,0.3);border-radius:3px;cursor:pointer;position:relative;}
#progfill{height:100%;background:#fff;border-radius:3px;width:0%;pointer-events:none;position:relative;}
#thumb{position:absolute;right:-6px;top:50%;transform:translateY(-50%);width:13px;height:13px;background:#fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5);}
#settbtn{pointer-events:auto;background:none;border:none;cursor:pointer;padding:6px;line-height:0;}
.tap-anim{position:absolute;top:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,0.9);font-size:24px;font-weight:800;background:rgba(0,0,0,0.6);padding:16px 24px;border-radius:50%;animation:tapFade 0.6s ease-out forwards;pointer-events:none;z-index:50;display:flex;align-items:center;justify-content:center;}
@keyframes tapFade{0%{opacity:1;transform:translate(-50%,-50%) scale(0.8);}100%{opacity:0;transform:translate(-50%,-50%) scale(1.5);}}
::cue{font-family:'Nunito',sans-serif;font-size:1.05em;font-weight:800;color:#ffffff;background:transparent;text-shadow:0 2px 8px rgba(0,0,0,0.95),0 0 24px rgba(0,0,0,0.8),-1px -1px 0 rgba(0,0,0,0.6),1px -1px 0 rgba(0,0,0,0.6),-1px 1px 0 rgba(0,0,0,0.6),1px 1px 0 rgba(0,0,0,0.6);letter-spacing:0.02em;line-height:1.5;}
</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
</head><body>
<video id="vid" playsinline webkit-playsinline crossorigin="anonymous">${trackTags}</video>
<div id="loader"><div class="spin"></div></div>
<div id="errbox"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>Stream unavailable<br>Open Settings to try another server</span></div>
<div id="ov" class="show">
  <div id="topbar">
    <button class="cbtn" id="backbtn" style="margin-right:auto">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <button id="settbtn">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
  </div>
  <div id="ctrls">
    <button class="cbtn" id="bkbtn"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg></button>
    <button class="cpbtn" id="plbtn">
      <svg id="iplay" width="30" height="30" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <svg id="ipause" width="30" height="30" viewBox="0 0 24 24" fill="white" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
    </button>
    <button class="cbtn" id="fwbtn"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg></button>
  </div>
  <div id="botbar">
    <div id="timerow">
      <span id="timelbl">0:00 / 0:00</span>
      <button id="fsbtn"><svg id="fsexp" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg><svg id="fscol" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="display:none"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg></button>
    </div>
    <div id="prog"><div id="progfill"><div id="thumb"></div></div></div>
  </div>
</div>
<script>
(function(){
var vid=document.getElementById('vid'),ov=document.getElementById('ov'),loader=document.getElementById('loader'),errbox=document.getElementById('errbox'),plbtn=document.getElementById('plbtn'),iplay=document.getElementById('iplay'),ipause=document.getElementById('ipause'),bkbtn=document.getElementById('bkbtn'),fwbtn=document.getElementById('fwbtn'),fsbtn=document.getElementById('fsbtn'),fsexp=document.getElementById('fsexp'),fscol=document.getElementById('fscol'),prog=document.getElementById('prog'),progfill=document.getElementById('progfill'),timelbl=document.getElementById('timelbl');
var hls=null,playing=false,htimer=null,src=${JSON.stringify(src)},spd=${initialSpeed || 1},startTime=${initialTime || 0};
var REFERER=${JSON.stringify(safeReferer)},ORIGIN=${JSON.stringify(safeOrigin)};
function fmt(s){if(!s||isNaN(s))return'0:00';var m=Math.floor(s/60),x=Math.floor(s%60);return m+':'+(x<10?'0':'')+x;}
function showOv(){ov.classList.add('show');rn('controlsVisibility', true);clearTimeout(htimer);if(playing)htimer=setTimeout(function(){ov.classList.remove('show');rn('controlsVisibility', false);},3000);}
var _rnt={};
function rn(t,p){
  var n=Date.now();if(_rnt[t]&&n-_rnt[t]<400)return;_rnt[t]=n;
  try{window.ReactNativeWebView.postMessage(JSON.stringify({type:t,payload:p}));}catch(e){}
}
var backbtn=document.getElementById('backbtn'),settbtn=document.getElementById('settbtn');
backbtn.addEventListener('click',function(e){e.stopPropagation();rn('goBack');});
settbtn.addEventListener('click',function(e){e.stopPropagation();rn('openSettings');});
function updPlay(){iplay.style.display=playing?'none':'block';ipause.style.display=playing?'block':'none';}
vid.addEventListener('play',function(){playing=true;updPlay();showOv();});
vid.addEventListener('pause',function(){playing=false;updPlay();showOv();});
vid.addEventListener('waiting',function(){loader.style.display='flex';});
vid.addEventListener('playing',function(){loader.style.display='none';});
vid.addEventListener('timeupdate',function(){var d=vid.duration||0,t=vid.currentTime||0;progfill.style.width=(d>0?(t/d)*100:0)+'%';timelbl.textContent=fmt(t)+' / '+fmt(d);});
vid.addEventListener('ended',function(){rn('ended',{});});
plbtn.addEventListener('click',function(e){e.stopPropagation();if(vid.paused)vid.play().catch(function(){});else vid.pause();showOv();});
bkbtn.addEventListener('click',function(e){e.stopPropagation();vid.currentTime=Math.max(0,vid.currentTime-10);showOv();});
fwbtn.addEventListener('click',function(e){e.stopPropagation();vid.currentTime=Math.min(vid.duration||0,vid.currentTime+10);showOv();});
var isDrag=false,wasPlay=false;
function updP(e){var r=prog.getBoundingClientRect();var c=e.touches?e.touches[0].clientX:e.clientX;var p=(c-r.left)/r.width;p=Math.max(0,Math.min(1,p));if(vid.duration)vid.currentTime=p*vid.duration;progfill.style.width=(p*100)+'%';}
prog.addEventListener('mousedown',function(e){isDrag=true;wasPlay=!vid.paused;vid.pause();updP(e);});
document.addEventListener('mousemove',function(e){if(isDrag)updP(e);});
document.addEventListener('mouseup',function(e){if(isDrag){isDrag=false;if(wasPlay)vid.play().catch(function(){});}});
prog.addEventListener('touchstart',function(e){isDrag=true;wasPlay=!vid.paused;vid.pause();updP(e);e.stopPropagation();},{passive:false});
document.addEventListener('touchmove',function(e){if(isDrag){updP(e);e.preventDefault();}},{passive:false});
document.addEventListener('touchend',function(e){if(isDrag){isDrag=false;if(wasPlay)vid.play().catch(function(){});}});
var isWeb = ${Platform.OS === 'web'};
function toggleFs(e) {
  e.stopPropagation();
  if (isWeb) {
    var doc = window.document;
    var docEl = doc.documentElement;
    var req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    var cancel = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement && !doc.mozFullScreenElement && !doc.msFullscreenElement) {
      if (req) req.call(docEl);
    } else {
      if (cancel) cancel.call(doc);
    }
  } else {
    rn('toggleFullscreen');
  }
}
fsbtn.addEventListener('click', toggleFs);
document.addEventListener('fullscreenchange',function(){var f=!!document.fullscreenElement;fsexp.style.display=f?'none':'block';fscol.style.display=f?'block':'none';});
document.addEventListener('webkitfullscreenchange',function(){var f=!!document.webkitFullscreenElement;fsexp.style.display=f?'none':'block';fscol.style.display=f?'block':'none';});
var lastTap=0;
document.body.addEventListener('click',function(e){if(e.target.closest('button')||e.target.closest('#prog'))return;var now=Date.now();if(now-lastTap<300){var x=e.clientX,w=window.innerWidth;var fwd=x>w/2;if(fwd)vid.currentTime=Math.min(vid.duration||0,vid.currentTime+10);else vid.currentTime=Math.max(0,vid.currentTime-10);var anim=document.createElement('div');anim.className='tap-anim';anim.innerText=fwd?'+10s':'-10s';anim.style.left=fwd?'75%':'25%';document.body.appendChild(anim);setTimeout(function(){anim.remove();},600);lastTap=0;}else{lastTap=now;if(ov.classList.contains('show')){ov.classList.remove('show');rn('controlsVisibility', false);}else showOv();}});

var touchStartY=0, touchStartX=0;
document.body.addEventListener('touchstart',function(e){touchStartY=e.changedTouches[0].screenY; touchStartX=e.changedTouches[0].screenX;},{passive:true});
document.body.addEventListener('touchend',function(e){
  var diffY=e.changedTouches[0].screenY-touchStartY;
  var diffX=e.changedTouches[0].screenX-touchStartX;
  if(Math.abs(diffY)>Math.abs(diffX) && Math.abs(diffY)>50){
    if(diffY>0) rn('swipeDown',{}); else rn('swipeUp',{});
  }
},{passive:true});

// ── Custom HLS.js fetch-loader: injects Referer + Origin on every HLS request ──
function loadSrc(url){
  if(hls){hls.destroy();hls=null;}
  loader.style.display='flex';errbox.style.display='none';vid.style.display='block';
  if(window.Hls && Hls.isSupported()){
    var hlsConfig = {enableWorker:false,maxBufferLength:30,startLevel:-1};
    hls=new Hls(hlsConfig);
    hls.loadSource(url);
    hls.attachMedia(vid);
    hls.on(Hls.Events.MANIFEST_PARSED,function(){
      loader.style.display='none';
      errbox.style.display='none';
      if(spd!==1)vid.playbackRate=spd;
      if(startTime>0){vid.currentTime=startTime;startTime=0;}
      var levels=hls.levels.map(function(l,i){return {height:l.height,index:i}});
      rn('qualities',levels);
      vid.play().catch(function(){});
    });
    hls.on(Hls.Events.ERROR,function(e,d){
      if(d.fatal){
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
          console.log("fatal network error encountered, try to recover");
          hls.startLoad();
        } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
          console.log("fatal media error encountered, try to recover");
          hls.recoverMediaError();
        } else {
          hls.destroy();
          loader.style.display='none';
          errbox.style.display='flex';
        }
      }
    });
  } else if(vid.canPlayType('application/vnd.apple.mpegurl')){
    vid.src=url;
    vid.addEventListener('loadedmetadata',function(){loader.style.display='none';if(spd!==1)vid.playbackRate=spd;if(startTime>0){vid.currentTime=startTime;startTime=0;}});
    vid.play().catch(function(){});
  } else {
    loader.style.display='none';errbox.style.display='flex';
  }
}
function onMsg(e){try{var m=JSON.parse(e.data);if(m.type==='setSpeed'){vid.playbackRate=m.value;spd=m.value;}if(m.type==='setSrc')loadSrc(m.value);if(m.type==='setQuality'&&hls){hls.currentLevel=m.value;}if(m.type==='setAudioBoost'){vid.volume=m.value/100;}if(m.type==='setSubtitle'){for(var i=0;i<vid.textTracks.length;i++){vid.textTracks[i].mode=m.value?'showing':'hidden';}}}catch(_){}}
window.addEventListener('message',onMsg);document.addEventListener('message',onMsg);
// Report time every 5s so RN can save progress
setInterval(function(){if(vid&&vid.duration>0){rn('timeUpdate',{time:Math.floor(vid.currentTime),duration:Math.floor(vid.duration)});}},5000);
loadSrc(src);
})();
</script>
</body>
</html>`;
  };

  const toggleSubtitles = (enabled) => {
    setSubtitlesEnabled(enabled);
    subtitlesEnabledRef.current = enabled;
    if (webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'setSubtitle', value: enabled }));
    }
    setActiveMenu('main');
  };

  const toggleDub = () => {
    if (!streamData) return;
    const hasDub = streamData?.episode?.hasDub;
    if (activeType === 'sub' && !hasDub) {
      Alert.alert('Not Available', 'Dub is not available for this episode.');
      return;
    }

    const newType = activeType === 'sub' ? 'dub' : 'sub';
    setActiveType(newType);
    activeTypeRef.current = newType;

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
    }
    if (!chosen) {
      chosen = sources.find(s => s.type === newType && isValid(s));
    }
    if (!chosen) {
      if (currentServer) chosen = sources.find(s => s.server === currentServer && s.type === newType);
      if (!chosen) chosen = sources.find(s => s.type === newType);
    }

    if (chosen) {
      setCurrentServer(chosen.server || '');
      const streamSrc = chosen.m3u8 || chosen.url;
      const tracks = chosen.tracks || [];
      const initialTime = progressRef.current?.time || 0;
      let refererBase = 'https://anikoto.net/';
      try { if (chosen.referer) refererBase = new URL(chosen.referer).origin + '/'; } catch (e) { }
      setStreamUrl({ html: buildPlayerHTML(streamSrc, chosen.referer || '', tracks, playbackSpeed, initialTime), baseUrl: refererBase });
    }
  };

  const handleServerChange = (serverName, serverType = null) => {
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
    // Use direct m3u8 — scraping is local so no proxy needed
    const streamSrc = chosen.m3u8 || chosen.url;
    const tracks = chosen.tracks || [];
    const initialTime = progressRef.current?.time || 0;
    const playerHTML = buildPlayerHTML(streamSrc, chosen.referer || '', tracks, playbackSpeed, initialTime);
    let refererBase = 'https://anikoto.net/';
    try { if (chosen.referer) refererBase = new URL(chosen.referer).origin + '/'; } catch (e) { }
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

  // Change stream quality via postMessage into WebView
  const handleQualityChange = (idx) => {
    setCurrentQuality(idx);
    setActiveMenu('main');
    if (webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'setQuality', value: idx }));
    }
  };

  useEffect(() => {
    if (webviewRef.current && prefs.audioBoost !== undefined) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'setAudioBoost', value: prefs.audioBoost }));
    }
  }, [prefs.audioBoost]);

  const changeEpisode = (idx) => {
    setCurrentEpIdx(idx);
    setIsVideoLoading(true);
  };

  const windowWidth = Dimensions.get('window').width;
  const windowHeight = Dimensions.get('window').height;

  const miniPlayerStyle = {
    position: 'absolute',
    bottom: 70, // above tab bar
    right: 16,
    width: 220,
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    zIndex: 9999,
  };

  const fullScreenContainerStyle = {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#050505',
    zIndex: 1000,
  };

  return (
    <Animated.View
      style={[
        isMinimized ? miniPlayerStyle : fullScreenContainerStyle,
        isMinimized && { transform: miniPlayerPosition.getTranslateTransform() }
      ]}
      {...(isMinimized ? miniPlayerPanResponder.panHandlers : {})}
    >
      <StatusBar hidden={!isMinimized} />

      {/* ── VIDEO PLAYER (Sticky top) ──────────────────────────────────────────────── */}
      <View style={[
        isMinimized ? { flex: 1 } : S.videoOuter,
        isFullscreen && !isMinimized && { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, zIndex: 1000 },
        !isMinimized && prefs.ambientMode && { shadowColor: '#fff', shadowOpacity: 0.15, shadowRadius: 40, elevation: 30 }
      ]}>
        {isStreamLoading ? (
          <View style={S.videoInner}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 12 }}>Loading stream...</Text>
          </View>
        ) : streamUrl ? (
          <WebView
            ref={webviewRef}
            source={streamUrl}
            style={S.videoInner}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            onLoadEnd={() => setIsVideoLoading(false)}
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
                    if (prefs.miniplayer) {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      minimize();
                    } else {
                      close();
                    }
                  }
                } else if (msg.type === 'toggleFullscreen') {
                  toggleFullscreenState();
                } else if (msg.type === 'ended') {
                  if (prefs.autoNext && currentEpIdx + 1 < episodes.length) {
                    changeEpisode(currentEpIdx + 1);
                  }
                  toggleFullscreenState();
                } else if (msg.type === 'timeUpdate' && msg.payload) {
                  // Update progress ref (no re-render)
                  progressRef.current = { time: msg.payload.time, duration: msg.payload.duration };
                  // Throttle AsyncStorage writes: only every 15s of real time
                  const now = Date.now();
                  if (!progressRef.current._lastSave || now - progressRef.current._lastSave > 15000) {
                    progressRef.current._lastSave = now;
                    updateProgress({ animeId, episodeIndex: currentEpIdx, progress: msg.payload.time, duration: msg.payload.duration });
                  }
                } else if (msg.type === 'controlsVisibility') {
                  setIsControlsVisible(msg.payload);
                } else if (msg.type === 'qualities') {
                  setQualityLevels([{ height: 'Auto', index: -1 }, ...msg.payload.reverse()]);
                } else if (msg.type === 'swipeDown') {
                  if (!isFullscreenRef.current && !isMinimized) {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    minimize();
                  } else if (isFullscreenRef.current) {
                    toggleFullscreenState(false);
                  }
                } else if (msg.type === 'swipeUp') {
                  if (!isFullscreenRef.current && !isMinimized) {
                    toggleFullscreenState(true);
                  }
                }
              } catch (_) { }
            }}
          />
        ) : (
          <View style={S.videoInner}>
            <Ionicons name="videocam-off-outline" size={32} color="#4b5563" style={{ marginBottom: 12 }} />
            <Text style={{ color: '#6b7280', fontSize: 14 }}>Stream not available for {playingTitle}</Text>
          </View>
        )}
      </View>

      {/* If minimized, overlay a touchable to maximize and close */}
      {isMinimized && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setIsControlsVisible(v => !v)} activeOpacity={1} />
          {isControlsVisible && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} pointerEvents="box-none">
              <TouchableOpacity style={{ position: 'absolute', top: 4, right: 4, padding: 6, zIndex: 10 }} onPress={close}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={{ position: 'absolute', top: '50%', left: '50%', marginTop: -20, marginLeft: -20, padding: 4, zIndex: 10 }}
                onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); maximize(); }}
              >
                <Ionicons name="expand" size={32} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ── SCROLLABLE CONTENT ──────────────────────────────────────────────── */}
      {
        !isFullscreen && !isMinimized && (
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
                      <TouchableOpacity style={S.likeBtn}>
                        <Ionicons name="thumbs-up-outline" size={18} color="#fff" />
                      </TouchableOpacity>
                      <View style={{ width: 1, backgroundColor: '#333' }} />
                      <TouchableOpacity style={S.likeBtn}>
                        <Ionicons name="thumbs-down-outline" size={18} color="#fff" />
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
              <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0f0f0f', borderTopLeftRadius: 16, borderTopRightRadius: 16, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.5, shadowRadius: 10, transform: [{ translateY: descSlideY }] }}>
                {/* Drag Handle and Header Wrapper */}
                <View {...descPanResponder.panHandlers} style={{ backgroundColor: 'transparent' }}>
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
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
                  {/* Stats Row */}
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                    <View style={S.descStatBox}>
                      <Text style={S.descStatVal}>290</Text>
                      <Text style={S.descStatLabel}>Likes</Text>
                    </View>
                    <View style={S.descStatBox}>
                      <Text style={S.descStatVal}>113K</Text>
                      <Text style={S.descStatLabel}>Views</Text>
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
              asModal={false}
            />
          </View>
        )}

      {/* ── SETTINGS MODAL ─────────────────────────────────────────────────── */}
      {
        !isMinimized && (
          <Modal visible={isSettingsOpen} transparent animationType="slide" onRequestClose={() => { setIsSettingsOpen(false); setActiveMenu('main'); }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', alignItems: isFullscreen ? 'center' : 'stretch' }}>
              <TouchableWithoutFeedback onPress={() => { setIsSettingsOpen(false); setActiveMenu('main'); }}>
                <View style={[StyleSheet.absoluteFill]} />
              </TouchableWithoutFeedback>
              <View style={[S.settingsSheet, isFullscreen && { width: 450, borderRadius: 16, marginBottom: 20, maxHeight: '90%' }]}>
                {/* Drag handle */}
                <View style={S.settingsHandleWrap}><View style={S.settingsHandle} /></View>
                <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

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
                        <Text style={S.settingsRowValue}>On</Text>
                        <Ionicons name="chevron-forward" size={16} color="#6b7280" style={{ marginLeft: 4 }} />
                      </TouchableOpacity>
                      {/* Quality */}
                      <TouchableOpacity style={S.settingsRow} onPress={() => setActiveMenu('quality')} activeOpacity={0.7}>
                        <Ionicons name="videocam-outline" size={20} color="#9ca3af" />
                        <Text style={S.settingsRowText}>Quality</Text>
                        <View style={{ flex: 1 }} />
                        <Text style={S.settingsRowValue}>Auto</Text>
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
                      {qualityLevels.map(q => (
                        <TouchableOpacity key={q.index} style={S.settingsRow} onPress={() => handleQualityChange(q.index)} activeOpacity={0.7}>
                          <View style={{ width: 28 }} />
                          <Text style={S.settingsRowText}>{q.height === 'Auto' ? 'Auto' : `${q.height}p`}</Text>
                          <View style={{ flex: 1 }} />
                          {currentQuality === q.index && <Ionicons name="checkmark" size={20} color="#fff" />}
                        </TouchableOpacity>
                      ))}
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
                      <TouchableOpacity style={S.settingsRow} onPress={() => toggleSubtitles(true)}>
                        <View style={{ width: 28 }} />
                        <Text style={S.settingsRowText}>On (Default)</Text>
                        <View style={{ flex: 1 }} />
                        {subtitlesEnabled && <Ionicons name="checkmark" size={20} color="#fff" />}
                      </TouchableOpacity>
                      <TouchableOpacity style={S.settingsRow} onPress={() => toggleSubtitles(false)}>
                        <View style={{ width: 28 }} />
                        <Text style={S.settingsRowText}>Off</Text>
                        <View style={{ flex: 1 }} />
                        {!subtitlesEnabled && <Ionicons name="checkmark" size={20} color="#fff" />}
                      </TouchableOpacity>
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
              </View>
            </View>
          </Modal>
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
    width: '100%', height: Dimensions.get('window').width * 9 / 16, backgroundColor: '#000',
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
  likeBtn: { paddingHorizontal: 16, paddingVertical: 10 },
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
});
