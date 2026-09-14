import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  Dimensions, Animated, RefreshControl, ActivityIndicator, FlatList,
  Modal, TouchableWithoutFeedback
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedShimmer } from '../components/SharedComponents';
import { TMDB_API_KEY, tmdbFetch, getList, saveToList, removeFromList, getHistory, getCachedTmdbEpisodeImage } from '../data/constants';
import { getHistoryFromCloud } from '../api/firestore';
import { useAuth } from '../context/AuthContext';
import { HOME_QUERY } from '../data/queries';
import { SCREENSHOT_FALLBACK_DATA, FALLBACK_COMMENTS } from '../data/mockData';
import { scrapeSubDubForTitles } from '../api/scrapers/search.scraper';
import { fetchInlineStream } from '../api/scrapers/inlineStream';

const { width, height } = Dimensions.get('window');
const HERO_HEIGHT = height * 0.72;

// ─── DiveBackInCard ─────────────────────────────────────────────────────────────
function DiveBackInCard({ item, onPress }) {
  const [imageUri, setImageUri] = useState(item.episodeImage || item.bannerImage || item.coverImage);
  const pct = item.duration > 0 ? Math.min(100, Math.round((item.progress / item.duration) * 100)) : 0;

  useEffect(() => {
    if (!item.episodeImage) {
      getCachedTmdbEpisodeImage(item.animeTitle, item.episodeIndex).then(uri => {
        if (uri !== 'NOT_FOUND') setImageUri(uri);
      });
    }
  }, [item.animeTitle, item.episodeIndex, item.episodeImage]);

  const formatTime = (seconds) => {
    if (!seconds) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <TouchableOpacity style={styles.diveCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.diveThumb}>
        <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.diveDurationBadge}>
          <Text style={styles.diveDurationText}>{formatTime(item.duration)}</Text>
        </View>
        <View style={styles.diveProgBar}>
          <View style={[styles.diveProgFill, { width: `${pct}%` }]} />
        </View>
      </View>
      <Text style={styles.diveAnimeTitle} numberOfLines={1}>{item.animeTitle}</Text>
      <Text style={styles.diveEpTitle} numberOfLines={1}>{item.episodeTitle || `Episode ${item.episodeIndex + 1}`}</Text>
    </TouchableOpacity>
  );
}

// ─── AnimeCard (matches web: 110px wide, 3/4.2 ratio) ─────────────────────
function AnimeCard({ data, onPress }) {
  const getStatusDotStyle = (status) => {
    if (!status) return { backgroundColor: '#6b7280' };
    const s = status.toUpperCase();
    if (s.includes('RELEASING') || s.includes('AIRING'))
      return { backgroundColor: '#22c55e', shadowColor: '#22c55e', shadowRadius: 6, shadowOpacity: 0.8 };
    if (s.includes('NOT_YET') || s.includes('UPCOMING'))
      return { backgroundColor: '#eab308', shadowColor: '#eab308', shadowRadius: 6, shadowOpacity: 0.8 };
    return { backgroundColor: '#6b7280' };
  };

  // hasSub/hasDub come from the anikoto enrichment pass (set directly on the card)
  // or fall back to episodes count if available
  const hasSub = data.hasSub === true || (data.episodes?.sub != null && data.episodes.sub > 0);
  const hasDub = data.hasDub === true || (data.episodes?.dub != null && data.episodes.dub > 0);

  return (
    <TouchableOpacity onPress={onPress} style={styles.animeCard} activeOpacity={0.75}>
      <View style={styles.animeCardImage}>
        <Image source={{ uri: data.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {(hasSub || hasDub) && (
          <View style={styles.subDubRow}>
            {hasSub && <View style={styles.subBadge}><Text style={styles.subDubText}>SUB</Text></View>}
            {hasDub && <View style={styles.dubBadge}><Text style={styles.subDubText}>DUB</Text></View>}
          </View>
        )}
      </View>
      <View style={styles.animeCardMeta}>
        <Text style={styles.animeCardType}>{data.type || data.format}</Text>
        <Text style={styles.animeCardYear}>{data.year || data.seasonYear || ''}</Text>
      </View>
      <View style={styles.animeCardTitleRow}>
        <View style={[styles.animeCardDot, getStatusDotStyle(data.status)]} />
        <Text style={styles.animeCardTitle} numberOfLines={2}>{data.title}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── SectionHeader ──────────────────────────────────────────────────────────
function SectionHeader({ title, onPress }) {
  return (
    <TouchableOpacity
      style={styles.sectionHeader}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <Text style={styles.sectionTitle}>{title}</Text>
      {onPress && <Ionicons name="chevron-forward" size={18} color="#6b7280" />}
    </TouchableOpacity>
  );
}

// ─── CommentCard ────────────────────────────────────────────────────────────
function CommentCard({ comment }) {
  return (
    <View style={styles.commentCard}>
      <View>
        <View style={styles.commentTop}>
          <Text style={styles.commentAnime} numberOfLines={1}>{comment.anime}</Text>
          <View style={styles.commentStats}>
            <Ionicons name="thumbs-up-outline" size={12} color="#6b7280" />
            <Text style={styles.commentStatText}>{comment.likes}</Text>
            <Ionicons name="chatbubble-outline" size={12} color="#6b7280" style={{ marginLeft: 8 }} />
            <Text style={styles.commentStatText}>{comment.replies}</Text>
          </View>
        </View>
        <Text style={styles.commentText} numberOfLines={2}>"{comment.text}"</Text>
      </View>
      <View style={styles.commentUserRow}>
        <Image source={{ uri: comment.avatar }} style={styles.commentAvatar} />
        <Text style={styles.commentUser}>{comment.user}</Text>
        <Text style={styles.commentTime}>{comment.time}</Text>
      </View>
    </View>
  );
}

// ─── InlineVideoCard ─────────────────────────────────────────────────────────
// YouTube-style inline preview: shows thumbnail at rest, auto-plays on activation.
// Only one card plays at a time via activeVideoId / onActivate.
function InlineVideoCard({ anime, onPress, isActive, onActivate }) {
  const videoRef = useRef(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [streamError, setStreamError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const mountedRef = useRef(true);

  // Stable values — no closure issues
  const animeId = String(anime.id);
  const epNum = String(anime.epIndex != null ? anime.epIndex + 1 : 1);
  const cardKey = `${animeId}-${epNum}`;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // When activated: fetch stream (VidStreaming 2 / MegaFlix first, MegaPlay fallback)
  useEffect(() => {
    if (!isActive) {
      // Pause and reset when deactivated
      videoRef.current?.pauseAsync().catch(() => { });
      setStreamUrl(null);
      setStreamError(false);
      setIsLoading(false);
      setIsMuted(true);
      return;
    }

    // Already have a stream URL — nothing to do, Video shouldPlay will handle it
    if (streamUrl) return;

    let cancelled = false;
    setIsLoading(true);
    setStreamError(false);

    // ── Fetch stream: MegaFlix (VidStreaming 2) first, MegaPlay as fallback ──
    // Promise.any — only 2 concurrent calls, first winner resolves immediately.
    fetchInlineStream(animeId, epNum)
      .then(m3u8 => {
        if (cancelled || !mountedRef.current) return;
        setStreamUrl(m3u8);
      })
      .catch(err => {
        console.warn('[InlineVideoCard] All streams failed:', err?.message ?? err);
        if (!cancelled && mountedRef.current) setStreamError(true);
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [isActive, animeId, epNum]); // stable primitives — no stale closure

  const handleThumbnailPress = () => {
    if (!isActive) {
      onActivate(cardKey);
    } else {
      onPress();
    }
  };

  return (
    <View style={styles.releaseCard}>
      {/* Video / Thumbnail area */}
      <TouchableOpacity
        style={styles.releaseThumbnail}
        onPress={handleThumbnailPress}
        activeOpacity={isActive ? 1 : 0.85}
      >
        {/* Thumbnail always shown under video until stream is ready */}
        <Image source={{ uri: anime.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />

        {isActive && streamUrl ? (
          // ── Live Video Player ──
          (() => {
            // Lazy-require expo-av so a missing native module never crashes HomeScreen at startup
            let VideoComponent = null;
            let coverMode = 'cover';
            try {
              const expoAv = require('expo-av');
              VideoComponent = expoAv.Video;
              coverMode = expoAv.ResizeMode?.COVER ?? 'cover';
            } catch (_) { }
            if (!VideoComponent) {
              // Native module unavailable — fall through to error state
              return (
                <View style={[StyleSheet.absoluteFill, styles.videoLoadingOverlay]}>
                  <TouchableOpacity onPress={onPress} style={{ alignItems: 'center', gap: 6 }}>
                    <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.8)" />
                    <Text style={{ color: '#aaa', fontSize: 11 }}>Open player</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            return (
              <View style={StyleSheet.absoluteFill}>
                <VideoComponent
                  ref={videoRef}
                  source={{ uri: streamUrl }}
                  style={StyleSheet.absoluteFill}
                  resizeMode={coverMode}
                  shouldPlay
                  isLooping
                  isMuted={isMuted}
                  onError={() => { setStreamError(true); setStreamUrl(null); }}
                />
                {/* Controls overlay */}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.55)']}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                {/* Mute toggle */}
                <TouchableOpacity
                  style={styles.muteBtn}
                  onPress={() => setIsMuted(m => !m)}
                >
                  <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={16} color="#fff" />
                </TouchableOpacity>
                {/* Tap-to-open indicator */}
                <TouchableOpacity style={styles.openFullBtn} onPress={onPress}>
                  <Ionicons name="expand" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            );
          })()
        ) : isActive && isLoading ? (
          // ── Loading spinner ──
          <View style={[StyleSheet.absoluteFill, styles.videoLoadingOverlay]}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : isActive && streamError ? (
          // ── Error state — show play icon so user can tap to open full player ──
          <View style={[StyleSheet.absoluteFill, styles.videoLoadingOverlay]}>
            <TouchableOpacity onPress={onPress} style={{ alignItems: 'center', gap: 6 }}>
              <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.8)" />
              <Text style={{ color: '#aaa', fontSize: 11 }}>Open player</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // ── Idle thumbnail ──
          <>
            <LinearGradient
              colors={['rgba(0,0,0,0.2)', 'transparent', 'rgba(0,0,0,0.3)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.releasePlayCircle}>
              <Ionicons name="play" size={13} color="#fff" />
            </View>
          </>
        )}

        {/* Ep badge bottom-right */}
        {anime.ep && (
          <View style={styles.releaseEpBadge}>
            <Text style={styles.releaseEpBadgeText}>{anime.ep.replace('Episode ', 'Ep ')}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Info row below — avatar + ep + title + time */}
      <TouchableOpacity onPress={onPress} style={styles.releaseInfoRow} activeOpacity={0.8}>
        <Image source={{ uri: anime.avatar || anime.image }} style={styles.releaseAvatar} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.releaseEpLabel}>{anime.ep}</Text>
          <Text style={styles.releaseTitle} numberOfLines={1}>{anime.title}</Text>
          <Text style={styles.releaseTime}>{anime.time || 'Recently'}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Hero Indicator ──────────────────────────────────────────────────────────
function HeroIndicators({ items, activeIndex, onPress }) {
  return (
    <View style={styles.indicators}>
      {items.map((_, idx) => (
        <TouchableOpacity key={idx} onPress={() => onPress(idx)} style={styles.indicatorWrap}>
          <View style={[styles.indicator, idx === activeIndex && styles.indicatorActive]} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main HomeScreen ─────────────────────────────────────────────────────────
export default function HomeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState(SCREENSHOT_FALLBACK_DATA);
  const [recentReleases, setRecentReleases] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const heroScrollRef = useRef(null);
  const heroTimerRef = useRef(null);
  const releasePage = useRef(1);
  const randomPageRef = useRef(Math.floor(Math.random() * 200) + 1);
  const [userList, setUserList] = useState([]);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  // Active inline video — only one plays at a time; null = all paused
  const [activeVideoId, setActiveVideoId] = useState(null);

  useFocusEffect(useCallback(() => {
    getList().then(setUserList);

    if (user) {
      getHistoryFromCloud(user.uid)
        .then(cloud => {
          if (cloud.length > 0) setHistory(cloud);
          else getHistory().then(setHistory);
        })
        .catch(() => getHistory().then(setHistory));
    } else {
      getHistory().then(setHistory);
    }
    // Pause any playing inline video when screen loses focus
    return () => setActiveVideoId(null);
  }, [user]));

  const activeHero = data.heroItems?.[activeHeroIndex] || data.trending?.[activeHeroIndex];

  const displayComments = useMemo(() => {
    if (data.recentComments?.length > 0) return data.recentComments;
    // Sort by likes (top) and randomize a selection on load
    return [...FALLBACK_COMMENTS]
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 5)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);
  }, [data.recentComments, loading]);
  const activeSaved = userList.find(x => String(x.animeId) === String(activeHero?.id));
  const savedStatus = activeSaved ? activeSaved.status : null;

  const handleSaveStatus = async (status) => {
    if (!activeHero) return;
    if (status === 'Remove') {
      await removeFromList(activeHero.id);
      setUserList(prev => prev.filter(x => String(x.animeId) !== String(activeHero.id)));
    } else {
      await saveToList({
        animeId: activeHero.id,
        animeTitle: activeHero.title,
        coverImage: activeHero.image,
        status: status,
        format: activeHero.type,
        year: activeHero.year,
        score: '?',
      });
      const updatedList = await getList();
      setUserList(updatedList);
    }
    setIsSaveMenuOpen(false);
  };

  // Navigation to Search/Notifications is handled directly via navigation.navigate() in the header.

  const startHeroTimer = useCallback((items) => {
    clearInterval(heroTimerRef.current);
    if (!items || items.length <= 1) return;
    heroTimerRef.current = setInterval(() => {
      setActiveHeroIndex(prev => {
        const next = (prev + 1) % items.length;
        heroScrollRef.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, 5000);
  }, []);

  const fetchHome = useCallback(async (pageNum = 1, reset = false) => {
    if (reset) {
      setLoading(true);
      randomPageRef.current = Math.floor(Math.random() * 200) + 1;
    }
    try {
      if (reset) setIsOffline(false);
      const randomPageNum = randomPageRef.current;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ query: HOME_QUERY, variables: { page: pageNum, randomPage: randomPageNum } }),
      });
      const json = await res.json();
      
      if (!res.ok || json.errors) {
        throw new Error('Anilist API error or rate limit');
      }

      if (json.data) {
        const d = json.data;
        // Match React app: use all trending for hero pool so filtering keeps enough
        const heroRaw = d.trending?.media?.slice(0, 10) || [];
        const heroItemsRaw = heroRaw.map(m => ({
          id: m.id,
          title: m.title?.english || m.title?.romaji || 'Unknown',
          image: m.coverImage?.extraLarge || m.bannerImage || '',
          type: m.format === 'TV' ? 'TV Show' : (m.format || 'TV Show'),
          status: m.status === 'RELEASING' ? 'AIRING' : (m.status || ''),
          year: String(m.seasonYear || ''),
        }));

        const trending = d.trending?.media?.map(m => ({
          id: m.id, title: m.title?.english || m.title?.romaji || 'Unknown',
          image: m.coverImage?.extraLarge || '',
          type: m.format === 'TV' ? 'TV Show' : (m.format || 'TV'),
          year: m.seasonYear, status: m.status,
        })) || SCREENSHOT_FALLBACK_DATA.trending;

        const popular = d.popular?.media?.map(m => ({
          id: m.id, title: m.title?.english || m.title?.romaji || 'Unknown',
          image: m.coverImage?.extraLarge || '',
          type: m.format === 'TV' ? 'TV Show' : (m.format || 'TV'),
          year: m.seasonYear, status: m.status,
        })) || SCREENSHOT_FALLBACK_DATA.popular;

        const random = d.random?.media?.map(m => ({
          id: m.id, title: m.title?.english || m.title?.romaji || 'Unknown',
          image: m.coverImage?.extraLarge || '',
          type: m.format === 'TV' ? 'TV Show' : (m.format || 'TV'),
          year: m.seasonYear, status: m.status,
        })) || [];

        // ── Enrich cards with sub/dub info from anikoto (fire-and-forget enrichment) ──
        const allCards = [...trending, ...popular, ...random];
        const allTitles = allCards.map(c => c.title);
        scrapeSubDubForTitles(allTitles)
          .then(subDubMap => {
            const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
            const enrich = (arr) => arr.map(c => {
              const info = subDubMap[normTitle(c.title)];
              return info ? { ...c, hasSub: info.hasSub, hasDub: info.hasDub } : c;
            });
            setData(prev => ({
              ...prev,
              trending: enrich(prev.trending || []),
              popular: enrich(prev.popular || []),
              random: enrich(prev.random || []),
            }));
          })
          .catch(() => { }); // silently fail — badges just won't show

        const upRaw = d.upcoming?.media?.[0];
        const upcoming = upRaw ? {
          id: upRaw.id,
          title: upRaw.title?.english || upRaw.title?.romaji || 'Unknown',
          image: upRaw.coverImage?.extraLarge || '',
          ep1Airing: upRaw.nextAiringEpisode
            ? (() => { const s = upRaw.nextAiringEpisode.timeUntilAiring; const day = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); return day > 0 ? `${day}d ${h}h` : `${h}h`; })()
            : 'Coming Soon',
          source: upRaw.source,
          synopsis: upRaw.description?.replace(/<[^>]*>?/gm, '') || '',
          genres: upRaw.genres?.slice(0, 3) || [],
        } : SCREENSHOT_FALLBACK_DATA.upcoming;

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

        const releases = d.recent?.media?.map(m => {
          const epNum = m.nextAiringEpisode ? Math.max(1, m.nextAiringEpisode.episode - 1) : 'Latest';
          return {
            id: m.id,
            title: m.title?.english || m.title?.romaji || 'Unknown',
            image: m.coverImage?.extraLarge || '',
            avatar: m.coverImage?.medium || '',
            ep: `Episode ${epNum}`,
            epIndex: typeof epNum === 'number' ? Math.max(0, epNum - 1) : 0,
            time: formatTimeAgo(m.updatedAt),
          };
        }) || [];

        let recentComments = [];
        try {
          const commentRes = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              query: `query { Page(page: 1, perPage: 3) { threadComments(sort: ID_DESC) { id comment(asHtml: true) createdAt user { name avatar { medium } } thread { title mediaCategories { id title { romaji english } } } } } }`
            })
          });
          const commentJson = await commentRes.json();
          if (commentJson.data?.Page?.threadComments) {
            recentComments = commentJson.data.Page.threadComments.map(c => {
              const media = c.thread?.mediaCategories?.[0];
              let epNum = null;
              if (c.thread?.title) {
                const epMatch = c.thread.title.match(/Episode\s(\d+)/i);
                if (epMatch) {
                  epNum = parseInt(epMatch[1], 10);
                }
              }
              return {
                id: String(c.id),
                anime: media?.title?.english || media?.title?.romaji || c.thread?.title || 'Unknown',
                animeId: media?.id || null,
                epNum: epNum,
                user: c.user?.name || 'Anonymous',
                avatar: c.user?.avatar?.medium,
                time: formatTimeAgo(c.createdAt),
                text: c.comment?.replace(/<[^>]*>?/gm, '').trim() || '',
                likes: 0,
                replies: 0,
              };
            });
          } else if (commentJson.errors) {
            console.log("AniList Comments API Error:", commentJson.errors);
          }
        } catch (err) {
          console.log("Failed to fetch comments separately", err);
        }

        // Fetch TMDB logos — exact match of React app logic (no extra query filters)
        const heroWithLogos = await Promise.all(
          heroItemsRaw.map(async (hero) => {
            let titleImage = null;
            try {
              // Step 1: Try TV search (exact same as React app — no extra filters)
              const searchRes = await tmdbFetch(
                `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(hero.title)}`
              );
              const searchData = await searchRes.json();
              if (searchData.results?.length > 0) {
                let tmdbId = searchData.results[0].id;
                const animeResult = searchData.results.find(r => r.original_language === 'ja' || (r.genre_ids && r.genre_ids.includes(16)));
                if (animeResult) tmdbId = animeResult.id;
                const imgRes = await tmdbFetch(`https://api.themoviedb.org/3/tv/${tmdbId}/images?api_key=${TMDB_API_KEY}`);
                const imgData = await imgRes.json();
                if (imgData.logos?.length > 0) {
                  const enLogo = imgData.logos.find(l => l.iso_639_1 === 'en');
                  const selectedLogo = enLogo || imgData.logos[0];
                  titleImage = `https://tmdb-proxy.bgtoons.workers.dev/t/p/w500${selectedLogo.file_path}`;
                }
              }
              // Step 2: Fallback to movie search (anime films not in TV db)
              if (!titleImage) {
                const movieRes = await tmdbFetch(
                  `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(hero.title)}`
                );
                const movieData = await movieRes.json();
                if (movieData.results?.length > 0) {
                  const mid = movieData.results[0].id;
                  const mImgRes = await tmdbFetch(`https://api.themoviedb.org/3/movie/${mid}/images?api_key=${TMDB_API_KEY}`);
                  const mImgData = await mImgRes.json();
                  if (mImgData.logos?.length > 0) {
                    const enLogo = mImgData.logos.find(l => l.iso_639_1 === 'en');
                    const selectedLogo = enLogo || mImgData.logos[0];
                    titleImage = `https://tmdb-proxy.bgtoons.workers.dev/t/p/w500${selectedLogo.file_path}`;
                  }
                }
              }
            } catch (_) { }
            return titleImage ? { ...hero, titleImage } : null;
          })
        );

        // Only keep heroes that have a logo (matching React app: filteredHeroItems)
        const filteredHeroes = heroWithLogos.filter(Boolean);
        const finalHeroes = filteredHeroes.length > 0 ? filteredHeroes : heroItemsRaw;

        const newData = { heroItems: finalHeroes, trending, popular, random, upcoming, recentComments };
        setData(newData);
        startHeroTimer(finalHeroes);
        if (reset) {
          setRecentReleases(releases);
          releasePage.current = 1;
        } else {
          setRecentReleases(prev => [...prev, ...releases]);
        }
      } else {
        throw new Error('Anilist API returned no data');
      }
    } catch (e) {
      console.log('Home fetch error:', e, '- showing offline state');
      setIsOffline(true);
      setData(SCREENSHOT_FALLBACK_DATA);
      startHeroTimer(SCREENSHOT_FALLBACK_DATA.heroItems);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [startHeroTimer]);

  useEffect(() => {
    fetchHome(1, true);
    return () => clearInterval(heroTimerRef.current);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setActiveHeroIndex(0);
    fetchHome(1, true);
  }, [fetchHome]);

  const onEndReached = useCallback(() => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    releasePage.current += 1;
    fetchHome(releasePage.current, false);
  }, [isLoadingMore, fetchHome]);

  const goToDetails = (id, autoPlayEpisodeIndex) => navigation.navigate('Details', { animeId: id, autoPlayEpisode: autoPlayEpisodeIndex });

  const heroItems = data.heroItems || [];

  return (
    <View style={{ flex: 1, backgroundColor: '#050505' }}>
      {/* Fixed floating header — transparent gradient, overlays the hero */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Text style={styles.logo}>KAIZOKU</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.headerIconBtn}>
            <Ionicons name="notifications-outline" size={22} color="#e5e7eb" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Search')} style={styles.headerIconBtn}>
            <Ionicons name="search-outline" size={22} color="#e5e7eb" />
          </TouchableOpacity>
        </View>
      </View>

      {/* AniList Offline Banner */}
      {isOffline && (
        <View style={{ backgroundColor: '#7c2d12', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
          <Ionicons name="wifi-outline" size={15} color="#fca5a5" />
          <Text style={{ color: '#fca5a5', fontSize: 11.5, flex: 1 }}>AniList is unavailable. Showing cached data — tap any anime for live details via ani.zip.</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" colors={['#4285F4', '#DB4437', '#F4B400', '#0F9D58']} progressViewOffset={insets.top + 50} />}
        onMomentumScrollEnd={onEndReached}
        scrollEventThrottle={400}
      >
        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <View style={[styles.hero, { height: HERO_HEIGHT }]}>
          {loading ? (
            <AnimatedShimmer style={StyleSheet.absoluteFill} />
          ) : (
            <ScrollView
              ref={heroScrollRef}
              horizontal
              pagingEnabled
              scrollEnabled={true}
              showsHorizontalScrollIndicator={false}
              style={StyleSheet.absoluteFill}
              onMomentumScrollEnd={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const index = Math.round(offsetX / width);
                if (index !== activeHeroIndex && index >= 0 && index < heroItems.length) {
                  setActiveHeroIndex(index);
                  clearInterval(heroTimerRef.current);
                  startHeroTimer(heroItems);
                }
              }}
            >
              {heroItems.map((hero, index) => (
                <TouchableOpacity
                  key={`hero-${hero.id}-${index}`}
                  style={{ width, height: HERO_HEIGHT }}
                  onPress={() => goToDetails(hero.id)}
                  activeOpacity={0.95}
                >
                  <Image
                    source={{ uri: hero.image }}
                    style={[StyleSheet.absoluteFill, { opacity: 0.8 }]}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Gradients */}
          <LinearGradient
            colors={['rgba(0,0,0,0.7)', 'transparent']}
            style={styles.heroTopGrad}
          />
          <LinearGradient
            colors={['transparent', 'rgba(5,5,5,0.9)', '#050505']}
            style={styles.heroBotGrad}
          />

          {/* Hero Content — centered */}
          {!loading && heroItems.length > 0 && (
            <View style={styles.heroContent} pointerEvents="box-none">
              {/* Logo image or title text */}
              {heroItems[activeHeroIndex]?.titleImage ? (
                <Image
                  source={{ uri: heroItems[activeHeroIndex].titleImage }}
                  style={styles.heroLogo}
                  resizeMode="contain"
                />
              ) : (
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {heroItems[activeHeroIndex]?.title}
                </Text>
              )}

              {/* Badges */}
              <View style={styles.heroBadges}>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>{heroItems[activeHeroIndex]?.type}</Text>
                </View>
                <View style={[styles.heroBadge, heroItems[activeHeroIndex]?.status === 'AIRING' && styles.heroBadgeGreen]}>
                  <Text style={[styles.heroBadgeText, heroItems[activeHeroIndex]?.status === 'AIRING' && styles.heroBadgeTextGreen]}>
                    {heroItems[activeHeroIndex]?.status}
                  </Text>
                </View>
                {heroItems[activeHeroIndex]?.year ? (
                  <View style={styles.heroBadge}>
                    <Text style={styles.heroBadgeText}>{heroItems[activeHeroIndex]?.year}</Text>
                  </View>
                ) : null}
              </View>

              {/* Buttons */}
              <View style={styles.heroButtons}>
                <TouchableOpacity
                  style={styles.watchNowBtn}
                  onPress={() => goToDetails(heroItems[activeHeroIndex]?.id)}
                >
                  <Text style={styles.watchNowText}>Watch Now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn} onPress={() => setIsSaveMenuOpen(true)}>
                  <Ionicons name={savedStatus ? "bookmark" : "add"} size={22} color={savedStatus ? "#d4c356" : "#fff"} />
                </TouchableOpacity>
              </View>

              {/* Progress Indicators */}
              <HeroIndicators
                items={heroItems}
                activeIndex={activeHeroIndex}
                onPress={(idx) => {
                  setActiveHeroIndex(idx);
                  heroScrollRef.current?.scrollTo({ x: idx * width, animated: true });
                  clearInterval(heroTimerRef.current);
                  startHeroTimer(heroItems);
                }}
              />
            </View>
          )}
        </View>

        {/* ── DIVE BACK IN ─────────────────────────────────────────────── */}
        {(loading || history.length > 0) && (
          <View style={styles.section}>
            <SectionHeader
              title="Dive Back In"
              onPress={() => navigation.navigate('You')}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.hScrollContent}>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <View key={`dive-skel-${i}`} style={{ width: 240 }}>
                    <AnimatedShimmer style={styles.diveThumb} />
                    <AnimatedShimmer style={{ width: '80%', height: 14, borderRadius: 4, marginBottom: 6 }} />
                    <AnimatedShimmer style={{ width: '50%', height: 16, borderRadius: 4 }} />
                  </View>
                ))
              ) : (
                history.slice(0, 10).map((item, idx) => (
                  <DiveBackInCard
                    key={`dive-${item.animeId}-${item.episodeIndex}-${idx}`}
                    item={item}
                    onPress={() => navigation.navigate('Details', {
                      animeId: item.animeId,
                      autoPlayEpisode: item.episodeIndex
                    })}
                  />
                ))
              )}
            </ScrollView>
          </View>
        )}

        {/* ── TRENDING NOW ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Trending Now"
            onPress={() => navigation.navigate('BrowseStack', { initialFilters: { sort: 'Trending' } })}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.hScrollContent}>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <AnimatedShimmer key={i} style={styles.skeletonCard} />)
              : (data.trending || []).map(anime => (
                <AnimeCard key={`t-${anime.id}`} data={anime} onPress={() => goToDetails(anime.id)} />
              ))
            }
          </ScrollView>
        </View>

        {/* ── RECENT COMMENTS ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Comments</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.hScrollContent}>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <View key={`comment-skel-${i}`} style={[styles.commentCard, { padding: 16 }]}>
                  <View style={styles.commentTop}>
                    <AnimatedShimmer style={{ width: '60%', height: 14, borderRadius: 4 }} />
                    <AnimatedShimmer style={{ width: '20%', height: 12, borderRadius: 4 }} />
                  </View>
                  <AnimatedShimmer style={{ width: '100%', height: 12, borderRadius: 4, marginTop: 12 }} />
                  <AnimatedShimmer style={{ width: '80%', height: 12, borderRadius: 4, marginTop: 6 }} />
                  <View style={styles.commentUserRow}>
                    <AnimatedShimmer style={styles.commentAvatar} />
                    <AnimatedShimmer style={{ width: '40%', height: 12, borderRadius: 4 }} />
                  </View>
                </View>
              ))
            ) : (
              displayComments.map(c => (
                <TouchableOpacity
                  key={c.id}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (c.animeId) {
                      navigation.navigate('Details', {
                        animeId: c.animeId,
                        autoPlayEpisode: c.epNum ? Math.max(0, c.epNum - 1) : 0,
                        openComments: true,
                      });
                    }
                  }}
                >
                  <CommentCard comment={c} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>

        {/* ── POPULAR THIS SEASON ──────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Popular This Season"
            onPress={() => navigation.navigate('BrowseStack', { initialFilters: { sort: 'Popularity' } })}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.hScrollContent}>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <AnimatedShimmer key={i} style={styles.skeletonCard} />)
              : (data.popular || []).map(anime => (
                <AnimeCard key={`p-${anime.id}`} data={anime} onPress={() => goToDetails(anime.id)} />
              ))
            }
          </ScrollView>
        </View>

        {/* ── RANDOM ANIMES ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Random Animes"
            onPress={() => navigation.navigate('BrowseStack', { initialFilters: { sort: 'Popularity' } })}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.hScrollContent}>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <AnimatedShimmer key={i} style={styles.skeletonCard} />)
              : (data.random || []).map(anime => (
                <AnimeCard key={`rand-${anime.id}`} data={anime} onPress={() => goToDetails(anime.id)} />
              ))
            }
          </ScrollView>
        </View>

        {/* ── TOP UPCOMING ─────────────────────────────────────────────── */}
        {(loading || data.upcoming) && (
          <View style={styles.section}>
            <SectionHeader title="Top Upcoming" />
            {loading ? (
              <View style={[styles.upcomingCard, { padding: 0 }]}>
                <AnimatedShimmer style={styles.upcomingImg} />
                <View style={styles.upcomingInfo}>
                  <AnimatedShimmer style={{ width: '40%', height: 12, borderRadius: 4 }} />
                  <AnimatedShimmer style={{ width: '60%', height: 18, borderRadius: 4, marginTop: 4 }} />
                  <View style={{ flex: 1, justifyContent: 'center', gap: 6, marginTop: 12 }}>
                    <AnimatedShimmer style={{ width: '100%', height: 14, borderRadius: 4 }} />
                    <AnimatedShimmer style={{ width: '80%', height: 14, borderRadius: 4 }} />
                  </View>
                  <View style={[styles.genreRow, { marginTop: 'auto' }]}>
                    <AnimatedShimmer style={{ width: 50, height: 20, borderRadius: 999 }} />
                    <AnimatedShimmer style={{ width: 60, height: 20, borderRadius: 999 }} />
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.upcomingCard}
                onPress={() => goToDetails(data.upcoming.id)}
                activeOpacity={0.85}
              >
                <Image source={{ uri: data.upcoming.image }} style={styles.upcomingImg} resizeMode="cover" />
                <View style={styles.upcomingInfo}>
                  <Text style={styles.upcomingLabel}>Ep 1 airing in</Text>
                  <Text style={styles.upcomingTime}>{data.upcoming.ep1Airing}</Text>
                  {data.upcoming.source && (
                    <Text style={styles.upcomingSource}>Source : {data.upcoming.source}</Text>
                  )}
                  <Text style={styles.upcomingTitle} numberOfLines={1}>{data.upcoming.title}</Text>
                  <Text style={styles.upcomingSynopsis} numberOfLines={2}>{data.upcoming.synopsis}</Text>
                  <View style={styles.genreRow}>
                    {(data.upcoming.genres || []).map(g => (
                      <View key={g} style={styles.genreChip}>
                        <Text style={styles.genreText}>{g}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── RECENT RELEASES ──────────────────────────────────────────── */}
        <View style={[styles.section, { paddingBottom: 24 }]}>
          <Text style={styles.sectionTitle}>Recent Releases</Text>
          <View style={{ gap: 28, marginTop: 16 }}>
            {loading
              ? Array.from({ length: 3 }).map((_, i) => <AnimatedShimmer key={i} style={styles.skeletonRelease} />)
              : recentReleases.map((anime, idx) => {
                const cardKey = `${anime.id}-${anime.epIndex ?? 0}`;
                return (
                  <InlineVideoCard
                    key={`r-${cardKey}-${idx}`}
                    anime={anime}
                    isActive={activeVideoId === cardKey}
                    onActivate={(key) => setActiveVideoId(key)}
                    onPress={() => {
                      // Stop inline video before opening full player
                      setActiveVideoId(null);
                      goToDetails(anime.id, anime.epIndex);
                    }}
                  />
                );
              })
            }
            {isLoadingMore && (
              <ActivityIndicator size="small" color="#6b7280" style={{ marginTop: 8 }} />
            )}
          </View>
        </View>

        {/* Bottom nav spacing */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── SAVE MENU MODAL ── */}
      <Modal visible={isSaveMenuOpen} transparent animationType="fade" onRequestClose={() => setIsSaveMenuOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableWithoutFeedback onPress={() => setIsSaveMenuOpen(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={styles.saveMenu}>
            <Text style={styles.saveMenuTitle}>Add to List</Text>
            {['Planning', 'Watching', 'On hold', 'Dropped', 'Finished', 'Rewatching'].map(status => (
              <TouchableOpacity key={status} style={styles.saveMenuBtn} onPress={() => handleSaveStatus(status)}>
                <View style={styles.saveMenuRadio}>
                  {savedStatus === status && <View style={styles.saveMenuRadioInner} />}
                </View>
                <Text style={styles.saveMenuBtnText}>{status}</Text>
              </TouchableOpacity>
            ))}
            {savedStatus && (
              <TouchableOpacity style={[styles.saveMenuBtn, { marginTop: 8, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 16 }]} onPress={() => handleSaveStatus('Remove')}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" style={{ marginRight: 12 }} />
                <Text style={[styles.saveMenuBtnText, { color: '#ef4444' }]}>Remove from List</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16,
    // Transparent gradient bg via overlay in JSX
  },
  logo: {
    color: '#ffffff',
    fontSize: 20,
    fontFamily: 'Shojumaru',
    letterSpacing: 6,
    marginTop: 4,
  },
  headerIcons: { flexDirection: 'row', gap: 20 },
  headerIconBtn: {},

  // Hero
  hero: { width, position: 'relative' },
  heroTopGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 130, zIndex: 1 },
  heroBotGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', zIndex: 1 },
  heroContent: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
    alignItems: 'center', paddingHorizontal: 20, paddingBottom: 28,
  },
  heroTitle: {
    color: '#ffffff', fontSize: 30, fontWeight: '800',
    textAlign: 'center', marginBottom: 20, lineHeight: 36,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  heroLogo: {
    width: '85%', height: 120, marginBottom: 24,
  },
  heroBadges: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  heroBadge: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 999, backgroundColor: 'rgba(26,26,26,0.8)',
  },
  heroBadgeText: { color: '#d1d5db', fontSize: 11, fontWeight: '600' },
  heroBadgeGreen: { borderWidth: 1, borderColor: '#22c55e33' },
  heroBadgeTextGreen: { color: '#22c55e' },
  heroButtons: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  watchNowBtn: {
    backgroundColor: '#ffffff', paddingHorizontal: 32, paddingVertical: 12,
    borderRadius: 999, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  watchNowText: { color: '#000000', fontWeight: '700', fontSize: 14 },
  addBtn: {
    width: 44, height: 44, borderRadius: 999,
    backgroundColor: 'rgba(26,26,26,0.8)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  indicators: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  indicatorWrap: { padding: 4 },
  indicator: { height: 3, width: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.35)' },
  indicatorActive: { width: 24, backgroundColor: '#ffffff' },

  // Section
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: '#ffffff', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  hScroll: { marginHorizontal: -20 },
  hScrollContent: { paddingHorizontal: 20, gap: 12 },

  // AnimeCard
  animeCard: { width: 110, flexShrink: 0 },
  animeCardImage: {
    width: 110, aspectRatio: 3 / 4.2,
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#1a1a1a',
    marginBottom: 6,
  },
  animeCardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, paddingHorizontal: 2 },
  animeCardType: { color: '#9ca3af', fontSize: 10, flex: 1, marginRight: 6 },
  animeCardYear: { color: '#9ca3af', fontSize: 10 },
  animeCardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, paddingHorizontal: 2 },
  animeCardDot: { width: 6, height: 6, borderRadius: 3, marginTop: 3, flexShrink: 0 },
  animeCardTitle: { color: '#e5e7eb', fontSize: 11, fontWeight: '600', lineHeight: 15, flex: 1 },
  subDubRow: {
    position: 'absolute', bottom: 6, left: 5,
    flexDirection: 'row', gap: 3,
  },
  subBadge: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  dubBadge: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  subDubText: { color: '#ffffff', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  // DiveBackInCard
  diveCard: { width: 240 },
  diveThumb: { width: 240, height: 135, borderRadius: 12, backgroundColor: '#1a1a1a', overflow: 'hidden', marginBottom: 8, position: 'relative' },
  diveDurationBadge: { position: 'absolute', bottom: 16, right: 8, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  diveDurationText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  diveProgBar: { position: 'absolute', bottom: 8, left: 8, right: 8, height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
  diveProgFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  diveAnimeTitle: { color: '#9ca3af', fontSize: 12, marginBottom: 2 },
  diveEpTitle: { color: '#e5e7eb', fontSize: 14, fontWeight: '600' },

  // Skeleton
  skeletonCard: { width: 110, aspectRatio: 3 / 4.2, borderRadius: 12, backgroundColor: '#1a1a1a' },
  skeletonRelease: { width: '100%', height: 220, borderRadius: 20, backgroundColor: '#111' },

  // Comment Card
  commentCard: {
    width: 280, height: 130,
    backgroundColor: '#111111', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: '#1a1a1a',
    justifyContent: 'space-between',
  },
  commentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  commentAnime: { color: '#9ca3af', fontSize: 11, fontWeight: '600', flex: 1, marginRight: 8 },
  commentStats: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentStatText: { color: '#6b7280', fontSize: 11, marginRight: 4 },
  commentText: { color: '#e5e7eb', fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
  commentUserRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  commentAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#222' },
  commentUser: { color: '#d1d5db', fontSize: 11, fontWeight: '600' },
  commentTime: { color: '#6b7280', fontSize: 10, marginLeft: 4 },

  // Upcoming
  upcomingCard: {
    backgroundColor: '#111111', borderRadius: 18,
    flexDirection: 'row', height: 170,
    overflow: 'hidden', borderWidth: 1, borderColor: '#1a1a1a',
  },
  upcomingImg: { width: '35%', height: '100%' },
  upcomingInfo: { flex: 1, padding: 14, justifyContent: 'space-between' },
  upcomingLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '500' },
  upcomingTime: { color: '#e5e7eb', fontSize: 15, fontWeight: '700' },
  upcomingSource: { color: '#6b7280', fontSize: 10 },
  upcomingTitle: { color: '#e5e7eb', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  upcomingSynopsis: { color: '#9ca3af', fontSize: 11, lineHeight: 15 },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  genreChip: { backgroundColor: '#d4c356', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  genreText: { color: '#000', fontSize: 10, fontWeight: '700' },

  // Release Card
  // Release Card — YouTube style
  releaseCard: { width: '100%' },
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
  // Inline video controls
  muteBtn: {
    position: 'absolute', bottom: 10, left: 10,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  openFullBtn: {
    position: 'absolute', bottom: 10, right: 10,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  videoLoadingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  saveMenu: { width: 280, backgroundColor: '#111', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#222' },
  saveMenuTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  saveMenuBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  saveMenuRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#444', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  saveMenuRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  saveMenuBtnText: { color: '#e5e7eb', fontSize: 15, fontWeight: '500' },
});
