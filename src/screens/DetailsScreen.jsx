import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  Dimensions, ActivityIndicator, Modal, TouchableWithoutFeedback
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedShimmer } from '../components/SharedComponents';
import { DETAILS_QUERY } from '../data/queries';
import { TMDB_API_KEY, getList, saveToList, removeFromList } from '../data/constants';
import { FALLBACK_DETAILS } from '../data/mockData';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';
import { saveListToCloud, removeFromListCloud, getReactionState, toggleReaction } from '../api/firestore';

const { width } = Dimensions.get('window');
const EPISODES_PER_PAGE = 25;

const TMDB_KEY = TMDB_API_KEY || '3dfa4bae246f35044e56a6dcd3294e3f';

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={S.infoRow}>
      <Text style={S.infoLabel}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={S.infoValue} numberOfLines={3}>{value}</Text>
      ) : (
        <View style={S.infoValueWrap}>{value}</View>
      )}
    </View>
  );
}

function Chip({ label, color = '#0e7490', bg = 'rgba(6,182,212,0.15)' }) {
  return (
    <View style={[S.chip, { backgroundColor: bg }]}>
      <Text style={[S.chipText, { color }]}>{label}</Text>
    </View>
  );
}

export default function DetailsScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { play } = usePlayer();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { animeId } = route.params;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [isFetchingEpisodes, setIsFetchingEpisodes] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');
  const [episodePage, setEpisodePage] = useState(1);
  const [sortOrder, setSortOrder] = useState('asc');
  const [savedStatus, setSavedStatus] = useState(null);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  // Reactions
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [userReaction, setUserReaction] = useState(null); // 'like' | 'dislike' | null
  const [reacting, setReacting] = useState(false);

  useFocusEffect(useCallback(() => {
    getList().then(list => {
      const saved = list.find(x => String(x.animeId) === String(animeId));
      setSavedStatus(saved ? saved.status : null);
    });
    // Load reaction counts (and user's vote if signed in)
    getReactionState(animeId, user?.uid || null).then(state => {
      setLikes(state.likes);
      setDislikes(state.dislikes);
      setUserReaction(state.userReaction);
    });
  }, [animeId, user?.uid]));

  const handleSaveStatus = async (status) => {
    if (!data) return;
    if (status === 'Remove') {
      await removeFromList(animeId);
      if (user?.uid) removeFromListCloud(user.uid, animeId).catch(() => { });
      setSavedStatus(null);
    } else {
      const listEntry = {
        animeId: data.id,
        animeTitle: data.title,
        coverImage: data.coverImage,
        status,
        format: data.format,
        year: data.seasonYear,
        score: data.averageScore,
      };
      await saveToList(listEntry);
      if (user?.uid) saveListToCloud(user.uid, listEntry).catch(() => { });
      setSavedStatus(status);
    }
    setIsSaveMenuOpen(false);
  };

  // ── Handle Like / Dislike ───────────────────────────────────────────────────
  const handleReaction = async (reaction) => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (reacting) return;
    setReacting(true);

    // Optimistic update
    const prev = { likes, dislikes, userReaction };
    if (userReaction === reaction) {
      // Toggle off
      setUserReaction(null);
      reaction === 'like' ? setLikes(l => Math.max(0, l - 1)) : setDislikes(d => Math.max(0, d - 1));
    } else {
      if (userReaction) {
        // Remove opposite
        userReaction === 'like' ? setLikes(l => Math.max(0, l - 1)) : setDislikes(d => Math.max(0, d - 1));
      }
      setUserReaction(reaction);
      reaction === 'like' ? setLikes(l => l + 1) : setDislikes(d => d + 1);
    }

    try {
      const result = await toggleReaction(
        animeId, user.uid, user.displayName, data?.title, reaction
      );
      // Sync with server truth
      setLikes(result.likes);
      setDislikes(result.dislikes);
      setUserReaction(result.userReaction);
    } catch (e) {
      // Revert on error
      setLikes(prev.likes);
      setDislikes(prev.dislikes);
      setUserReaction(prev.userReaction);
      console.log('[DetailsScreen] reaction error:', e?.message);
    } finally {
      setReacting(false);
    }
  };

  const sortedEpisodes = [...episodes].sort((a, b) => {
    const aNum = a.absolute_episode_number || a.episode_number || 0;
    const bNum = b.absolute_episode_number || b.episode_number || 0;
    return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
  });

  const totalEpPages = Math.max(1, Math.ceil(sortedEpisodes.length / EPISODES_PER_PAGE));
  const pagedEpisodes = sortedEpisodes.slice((episodePage - 1) * EPISODES_PER_PAGE, episodePage * EPISODES_PER_PAGE);

  useEffect(() => { fetchDetails(); }, [animeId]);

  useEffect(() => {
    if (!loading && !isFetchingEpisodes && route.params?.autoPlayEpisode !== undefined && data && episodes.length > 0) {
      goToPlayer(route.params.autoPlayEpisode);
      navigation.setParams({ autoPlayEpisode: undefined });
    }
  }, [loading, isFetchingEpisodes, data, episodes, route.params?.autoPlayEpisode]);

  const formatType = (format) => {
    if (!format) return 'TV Show';
    if (format === 'TV' || format === 'TV_SHORT') return 'TV Show';
    if (format === 'MOVIE') return 'MOVIE';
    return format;
  };

  const formatDate = (dateObj) => {
    if (!dateObj || !dateObj.year) return '?';
    const d = new Date(dateObj.year, (dateObj.month || 1) - 1, dateObj.day || 1);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ query: DETAILS_QUERY, variables: { id: parseInt(animeId) } }),
      });
      const json = await res.json();
      if (json.data?.Media) {
        const m = json.data.Media;
        const processed = {
          id: m.id,
          idMal: m.idMal,
          title: m.title?.english || m.title?.romaji || 'Unknown',
          nativeTitle: m.title?.native || '',
          synonyms: m.synonyms || [],
          bannerImage: m.bannerImage || '',
          coverImage: m.coverImage?.extraLarge || '',
          status: m.status,
          format: formatType(m.format),
          season: m.season,
          seasonYear: m.seasonYear,
          description: m.description?.replace(/<[^>]*>?/gm, '') || '',
          averageScore: m.averageScore || '?',
          duration: m.duration || '?',
          startDate: m.startDate,
          endDate: m.endDate,
          source: m.source?.replace(/_/g, ' ') || 'UNKNOWN',
          countryOfOrigin: m.countryOfOrigin,
          hashtag: m.hashtag,
          genres: m.genres || [],
          tags: m.tags?.map(t => t.name) || [],
          studios: m.studios?.edges?.map(e => e.node.name) || [],
          externalLinks: m.externalLinks || [],
          trailer: m.trailer?.site === 'youtube' ? m.trailer.id : null,
          characters: m.characters?.edges?.map(e => ({
            name: e.node.name.full,
            image: e.node.image.large,
            role: e.role,
            va: e.voiceActors?.[0] ? { name: e.voiceActors[0].name.full, image: e.voiceActors[0].image.large } : null,
          })) || [],
          staff: m.staff?.edges?.map(e => ({
            name: e.node.name.full,
            role: e.role,
            image: e.node.image.large,
          })) || [],
          relations: m.relations?.edges
            ?.filter(e => e.node.format && ['TV', 'TV_SHORT', 'OVA', 'ONA', 'MOVIE', 'SPECIAL'].includes(e.node.format))
            ?.map(e => ({
              relationType: e.relationType?.replace(/_/g, ' ') || 'OTHER',
              id: e.node?.id,
              title: e.node?.title?.english || e.node?.title?.romaji || 'Unknown',
              coverImage: e.node?.coverImage?.large || '',
              format: formatType(e.node?.format),
              year: e.node?.seasonYear || '?',
            })) || [],
          recommendations: m.recommendations?.nodes
            ?.filter(n => n.mediaRecommendation)
            ?.map(n => ({
              id: n.mediaRecommendation?.id,
              title: n.mediaRecommendation?.title?.english || n.mediaRecommendation?.title?.romaji || 'Unknown',
              coverImage: n.mediaRecommendation?.coverImage?.large || '',
              format: formatType(n.mediaRecommendation?.format),
              season: n.mediaRecommendation?.season || '',
              year: n.mediaRecommendation?.seasonYear || '',
            })) || [],
          episodeCount: m.episodes,
          nextAiringEpisode: m.nextAiringEpisode?.episode,
        };
        setData(processed);
        fetchTMDBEpisodes(processed);
      }
    } catch (e) {
      console.log('Details fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTMDBEpisodes = async (d) => {
    setIsFetchingEpisodes(true);
    try {
      const title = d.title;
      const searchRes = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`);
      const searchData = await searchRes.json();

      if (!searchData.results?.length) {
        if (d.episodeCount) {
          const dummyEps = Array.from({ length: d.episodeCount }).map((_, i) => ({
            name: `Episode ${i + 1}`,
            episode_number: i + 1,
            absolute_episode_number: i + 1,
          }));
          setEpisodes(dummyEps);
        } else {
          setEpisodes([]);
        }
        setIsFetchingEpisodes(false);
        return;
      }

      const possibleTitles = [d.title, d.nativeTitle, ...(d.synonyms || [])].filter(Boolean).map(t => t.toLowerCase().trim());
      const aniYear = d.seasonYear || d.startDate?.year;
      let bestShow = searchData.results[0];
      let bestScore = -1;

      searchData.results.forEach(r => {
        const rName = (r.name || r.original_name || '').toLowerCase().trim();
        let score = 0;
        if (possibleTitles.includes(rName)) score += 10;
        else if (possibleTitles.some(t => t.includes(rName) || rName.includes(t))) score += 5;
        if (r.origin_country?.includes('JP')) score += 5;
        if (aniYear && r.first_air_date?.startsWith(String(aniYear))) score += 5;
        if (score > bestScore) { bestScore = score; bestShow = r; }
      });

      const tmdbId = bestShow.id;
      const tvRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_KEY}`);
      const tvData = await tvRes.json();
      const seasons = tvData.seasons?.filter(s => s.season_number > 0) || [];

      let targetSeason = 1;
      if (seasons.length > 0) {
        const matchedSeason = seasons.find(s => {
          const sName = (s.name || '').toLowerCase().trim();
          if (sName.length < 3) return false;
          return possibleTitles.some(t => t.includes(sName) || sName.includes(t));
        });
        if (matchedSeason) {
          targetSeason = matchedSeason.season_number;
        } else if (aniYear) {
          const yearMatch = seasons.find(s => s.air_date?.startsWith(String(aniYear)));
          targetSeason = yearMatch ? yearMatch.season_number : seasons[0].season_number;
        } else {
          targetSeason = seasons[0].season_number;
        }
      }

      const expectedEps = d.episodeCount;
      const seasonsToFetch = [];
      let accumulated = 0;
      const startIndex = seasons.findIndex(s => s.season_number === targetSeason);
      if (startIndex !== -1) {
        for (let i = startIndex; i < seasons.length; i++) {
          seasonsToFetch.push(seasons[i].season_number);
          accumulated += seasons[i].episode_count;
          if (expectedEps && accumulated >= expectedEps - 2) break;
        }
      } else {
        seasonsToFetch.push(targetSeason);
      }

      const seasonResults = await Promise.all(
        seasonsToFetch.map(sn => fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${sn}?api_key=${TMDB_KEY}`).then(r => r.json()))
      );

      let allEps = [];
      seasonResults.forEach(sd => { if (sd.episodes) allEps = allEps.concat(sd.episodes); });

      const today = new Date();
      allEps = allEps.filter(ep => {
        // If Anilist says episode N is next, filter out anything >= N
        if (d.nextAiringEpisode && ep.episode_number >= d.nextAiringEpisode) {
          return false;
        }
        // Fallback: check TMDB air_date
        if (ep.air_date) {
          const airDate = new Date(ep.air_date);
          if (airDate > today) return false;
        }
        return true;
      });

      if (allEps.length === 0 && expectedEps) {
        // Fallback: generate dummy episodes if TMDB mapping is broken
        const releasedCount = d.nextAiringEpisode ? d.nextAiringEpisode - 1 : expectedEps;
        allEps = Array.from({ length: releasedCount }).map((_, i) => ({
          name: `Episode ${i + 1}`,
          episode_number: i + 1,
          absolute_episode_number: i + 1,
        }));
      }

      setEpisodes(allEps.map((ep, idx) => ({ ...ep, absolute_episode_number: idx + 1 })));
    } catch (e) {
      console.log('TMDB fetch error:', e);
      // If error occurs, fallback to expectedEps
      const fallbackCount = d.nextAiringEpisode ? d.nextAiringEpisode - 1 : (d.episodeCount || 0);
      if (fallbackCount > 0) {
        const dummyEps = Array.from({ length: fallbackCount }).map((_, i) => ({
          name: `Episode ${i + 1}`,
          episode_number: i + 1,
          absolute_episode_number: i + 1,
        }));
        setEpisodes(dummyEps);
      } else {
        setEpisodes([]);
      }
    } finally {
      setIsFetchingEpisodes(false);
    }
  };

  const getMalLink = (links) => links?.find(l => l.site === 'MyAnimeList')?.url || null;

  const goToPlayer = async (epIdx = 0, resume = false) => {
    let targetIdx = epIdx;
    if (resume) {
      try {
        const { getHistory } = require('../data/constants');
        const h = await getHistory();
        const existing = h.find(x => String(x.animeId) === String(data.id));
        if (existing) {
          targetIdx = existing.episodeIndex;
        }
      } catch (e) {
        console.log('Failed to resume history', e);
      }
    }

    play({
      animeId: data.id,
      idMal: data.idMal,
      animeTitle: data.title,
      coverImage: data.coverImage,
      nativeTitle: data.nativeTitle,
      synonyms: data.synonyms,
      description: data.description,
      genres: data.genres,
      episodes,
      episodeIndex: targetIdx,
      trailer: data.trailer,
      relations: data.relations,
      recommendations: data.recommendations,
    });
  };

  // ─── Loading State ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={S.container}>
        <View style={[S.loadingHeader, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.backCircle}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <AnimatedShimmer style={{ width, height: 220 }} />
        <View style={{ padding: 20, gap: 12 }}>
          <AnimatedShimmer style={{ height: 24, width: '70%', borderRadius: 6 }} />
          <AnimatedShimmer style={{ height: 16, width: '50%', borderRadius: 6 }} />
          <AnimatedShimmer style={{ height: 44, borderRadius: 999 }} />
          <AnimatedShimmer style={{ height: 120, borderRadius: 12 }} />
        </View>
      </View>
    );
  }

  if (!data) return <View style={S.container} />;

  const isUpcoming = data.status === 'NOT_YET_RELEASED';

  return (
    <View style={S.container}>
      {/* ── STICKY HEADER overlaying banner ── */}
      <View style={[S.header, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backCircle}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity style={S.iconBtn} onPress={() => navigation.navigate('Notifications')}><Ionicons name="notifications-outline" size={22} color="#e5e7eb" /></TouchableOpacity>
          <TouchableOpacity style={S.iconBtn} onPress={() => navigation.navigate('Search')}><Ionicons name="search-outline" size={22} color="#e5e7eb" /></TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }} stickyHeaderIndices={[2]}>
        {/* ── BANNER ── */}
        <View style={S.bannerWrap}>
          {data.bannerImage ? (
            <Image source={{ uri: data.bannerImage }} style={S.banner} resizeMode="cover" />
          ) : (
            <View style={[S.banner, { backgroundColor: '#0c0c2c' }]} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(5,5,5,0.6)', '#050505']}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* ── HERO INFO ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, zIndex: 11 }}>
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            <View style={S.coverWrap}>
              <Image source={{ uri: data.coverImage }} style={S.cover} resizeMode="cover" />
            </View>
            <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 4 }}>
              {isUpcoming && (
                <View style={S.upcomingBadge}><Text style={S.upcomingText}>UPCOMING</Text></View>
              )}
              <Text style={S.title} numberOfLines={3}>{data.title}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {data.format && <Chip label={data.format} />}
                {data.season && <Chip label={data.season} />}
                {data.seasonYear && <Chip label={String(data.seasonYear)} />}
              </View>
            </View>
          </View>

          {/* Native title / synonyms */}
          {(data.nativeTitle || data.synonyms?.[0]) && (
            <Text style={S.nativeTitle} numberOfLines={2}>
              {data.nativeTitle}{data.synonyms?.[0] ? ` • ${data.synonyms[0]}` : ''}
            </Text>
          )}

          {/* ── ACTION ROW ── */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -20, marginBottom: 24 }}
            contentContainerStyle={{ paddingHorizontal: 20, alignItems: 'center', gap: 12 }}
          >
            <TouchableOpacity
              style={[S.watchNowBtn, isFetchingEpisodes && { opacity: 0.5 }]}
              onPress={() => { if (!isFetchingEpisodes && episodes.length > 0) goToPlayer(0, true); }}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={16} color="#000" />
              <Text style={S.watchNowText}>{isFetchingEpisodes ? 'Loading...' : 'Watch Now'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.iconCircle} onPress={() => setIsSaveMenuOpen(true)}>
              <Ionicons name={savedStatus ? "bookmark" : "bookmark-outline"} size={20} color={savedStatus ? "#d4c356" : "#9ca3af"} />
            </TouchableOpacity>

            {/* ── LIKE/DISLIKE PILL ── */}
            <View style={S.likeGroup}>
              <TouchableOpacity style={S.likeBtn} onPress={() => handleReaction('like')} activeOpacity={0.7}>
                <Ionicons name={userReaction === 'like' ? "thumbs-up" : "thumbs-up-outline"} size={18} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 13, marginLeft: 6, fontWeight: '600' }}>
                  {likes > 0 ? (likes >= 1000 ? `${(likes / 1000).toFixed(1)}k` : likes) : 'Like'}
                </Text>
              </TouchableOpacity>
              <View style={{ width: 1, backgroundColor: '#333' }} />
              <TouchableOpacity style={S.likeBtn} onPress={() => handleReaction('dislike')} activeOpacity={0.7}>
                <Ionicons name={userReaction === 'dislike' ? "thumbs-down" : "thumbs-down-outline"} size={18} color="#fff" />
                {dislikes > 0 && <Text style={{ color: '#fff', fontSize: 13, marginLeft: 6, fontWeight: '600' }}>{dislikes >= 1000 ? `${(dislikes / 1000).toFixed(1)}k` : dislikes}</Text>}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={S.iconCircle}>
              <Ionicons name="share-social-outline" size={20} color="#9ca3af" />
            </TouchableOpacity>
            
            {/* AL badge */}
            <View style={S.alBadge}><Text style={S.alText}>AL</Text></View>
            {getMalLink(data.externalLinks) && (
              <View style={S.malBadge}><Text style={S.malText}>MAL</Text></View>
            )}
          </ScrollView>
        </View>

        {/* ── TABS ── */}
        <View style={{ backgroundColor: '#050505', zIndex: 10, paddingTop: insets.top + 44, marginTop: -(insets.top + 44) }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.tabScroll} contentContainerStyle={{ paddingHorizontal: 20 }}>
            {['Overview', 'Episodes', 'Related', 'More like this'].map(tab => (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[S.tab, activeTab === tab && S.tabActive]}>
                <Text style={[S.tabText, activeTab === tab && S.tabTextActive]}>{tab}</Text>
                {activeTab === tab && <View style={S.tabUnderline} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={{ height: 1, backgroundColor: '#1a1a1a', marginBottom: 20 }} />
        </View>

        {/* ── TAB CONTENT ── */}
        <View style={{ paddingHorizontal: 20 }}>

          {/* ── OVERVIEW ── */}
          {activeTab === 'Overview' && (
            <View>
              {/* Description */}
              {!!data.description && (
                <Text style={{ color: '#d1d5db', fontSize: 13, lineHeight: 20, marginBottom: 20 }}>
                  {data.description}
                </Text>
              )}
              {/* Stats grid */}
              <View style={S.statsGrid}>
                <View style={S.statCell}>
                  <Text style={S.statLabel}>Average Score</Text>
                  <Text style={S.statValue}>{data.averageScore}</Text>
                </View>
                <View style={[S.statCell, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#222' }]}>
                  <Text style={S.statLabel}>Type</Text>
                  <Text style={[S.statValue, { fontSize: 15 }]}>{data.format}</Text>
                </View>
                <View style={S.statCell}>
                  <Text style={S.statLabel}>Duration</Text>
                  <Text style={S.statValue}>{data.duration}</Text>
                </View>
              </View>

              {/* Info list */}
              <View style={S.infoBox}>
                <InfoRow label="Start:" value={formatDate(data.startDate)} />
                <InfoRow label="End:" value={formatDate(data.endDate)} />
                <InfoRow label="Season:" value={data.season && data.seasonYear ? `${data.season} ${data.seasonYear}` : '?'} />
                <InfoRow label="Status:" value={
                  <Text style={{ color: isUpcoming ? '#eab308' : data.status === 'RELEASING' ? '#22c55e' : '#d1d5db', fontSize: 13 }}>
                    {isUpcoming ? 'UPCOMING' : data.status}
                  </Text>
                } />
                <InfoRow label="Source:" value={data.source} />
                <InfoRow label="Country:" value={data.countryOfOrigin} />
                <InfoRow label="Hashtag:" value={data.hashtag} />
                <InfoRow label="Native:" value={data.nativeTitle} />
                {data.synonyms?.length > 0 && <InfoRow label="Synonyms:" value={data.synonyms.join(', ')} />}
              </View>

              {/* Studios */}
              {data.studios.length > 0 && (
                <View style={S.section}>
                  <Text style={S.sectionTitle}>Studios</Text>
                  <View style={S.tagWrap}>
                    {data.studios.map(s => (
                      <View key={s} style={S.tagPill}><Text style={S.tagText}>{s}</Text></View>
                    ))}
                  </View>
                </View>
              )}

              {/* Genres */}
              {data.genres.length > 0 && (
                <View style={S.section}>
                  <Text style={S.sectionTitle}>Genres</Text>
                  <View style={S.tagWrap}>
                    {data.genres.map(g => (
                      <View key={g} style={S.tagPill}><Text style={S.tagText}>{g}</Text></View>
                    ))}
                  </View>
                </View>
              )}

              {/* Tags */}
              {data.tags.length > 0 && (
                <View style={S.section}>
                  <Text style={S.sectionTitle}>Tags</Text>
                  <View style={S.tagWrap}>
                    {data.tags.slice(0, 15).map(t => (
                      <View key={t} style={S.tagPillSm}><Text style={S.tagTextSm}>{t}</Text></View>
                    ))}
                  </View>
                </View>
              )}

              {/* Characters */}
              {data.characters.length > 0 && (
                <View style={S.section}>
                  <Text style={S.sectionTitle}>Characters</Text>
                  {data.characters.map((c, i) => (
                    <View key={i} style={S.charRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Image source={{ uri: c.image }} style={S.charAvatar} />
                        <View>
                          <Text style={S.charName}>{c.name}</Text>
                          <Text style={S.charRole}>{c.role}</Text>
                        </View>
                      </View>
                      {c.va && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={S.charName}>{c.va.name}</Text>
                            <Text style={S.charRole}>Japanese</Text>
                          </View>
                          <Image source={{ uri: c.va.image }} style={S.charAvatar} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Staff */}
              {data.staff.length > 0 && (
                <View style={S.section}>
                  <Text style={S.sectionTitle}>Staff</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {data.staff.map((s, i) => (
                        <View key={i} style={{ width: 96 }}>
                          <Image source={{ uri: s.image }} style={S.staffImg} resizeMode="cover" />
                          <Text style={S.staffRole} numberOfLines={1}>{s.role}</Text>
                          <Text style={S.staffName} numberOfLines={2}>{s.name}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* ── EPISODES ── */}
          {activeTab === 'Episodes' && (
            <View>
              {/* Header row */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={S.epCountBadge}>
                  <Text style={S.epCountText}>
                    {episodes.length > 0 ? episodes.length : (data.episodeCount || '?')} Episodes
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={S.epActionBtn} onPress={() => { if (data) fetchTMDBEpisodes(data); }}>
                    <Ionicons name="refresh-outline" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                  <TouchableOpacity style={S.epActionBtn} onPress={() => { setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); setEpisodePage(1); }}>
                    <Ionicons name="swap-vertical-outline" size={18} color={sortOrder === 'desc' ? '#fff' : '#9ca3af'} />
                  </TouchableOpacity>
                </View>
              </View>

              {isFetchingEpisodes ? (
                [1, 2, 3, 4, 5].map(i => (
                  <AnimatedShimmer key={i} style={{ height: 100, borderRadius: 16, marginBottom: 12 }} />
                ))
              ) : pagedEpisodes.length > 0 ? (
                pagedEpisodes.map(ep => (
                  <TouchableOpacity
                    key={ep.id}
                    style={S.epCard}
                    onPress={() => goToPlayer((ep.absolute_episode_number || ep.episode_number) - 1)}
                    activeOpacity={0.85}
                  >
                    <View style={S.epThumb}>
                      <Image
                        source={{ uri: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : data.coverImage }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                      <View style={S.epNumBadge}>
                        <Text style={S.epNumText}>Ep {ep.absolute_episode_number || ep.episode_number}</Text>
                      </View>
                    </View>
                    <View style={S.epInfo}>
                      <Text style={S.epTitle} numberOfLines={1}>{ep.name || `Episode ${ep.episode_number}`}</Text>
                      <Text style={S.epOverview} numberOfLines={3}>{ep.overview || 'No description available.'}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={S.emptyEp}>
                  <Text style={S.emptyEpTitle}>Episodes currently unavailable.</Text>
                  <Text style={S.emptyEpSub}>Try refreshing or checking TMDB mappings.</Text>
                </View>
              )}

              {/* Pagination */}
              {totalEpPages > 1 && !isFetchingEpisodes && (
                <View style={S.pagination}>
                  <TouchableOpacity style={S.pageBtn} onPress={() => setEpisodePage(1)} disabled={episodePage === 1}>
                    <Text style={S.pageBtnText}>{'<<'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.pageBtn} onPress={() => setEpisodePage(p => Math.max(1, p - 1))} disabled={episodePage === 1}>
                    <Text style={S.pageBtnText}>{'<'}</Text>
                  </TouchableOpacity>
                  <View style={S.pageNum}>
                    <Text style={S.pageNumText}>{episodePage} / {totalEpPages}</Text>
                  </View>
                  <TouchableOpacity style={S.pageBtn} onPress={() => setEpisodePage(p => Math.min(totalEpPages, p + 1))} disabled={episodePage === totalEpPages}>
                    <Text style={S.pageBtnText}>{'>'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.pageBtn} onPress={() => setEpisodePage(totalEpPages)} disabled={episodePage === totalEpPages}>
                    <Text style={S.pageBtnText}>{'>>'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── RELATED ── */}
          {activeTab === 'Related' && (
            <View>
              {data.relations.length > 0 ? data.relations.map(rel => (
                <TouchableOpacity
                  key={`rel-${rel.id}`}
                  style={S.relCard}
                  onPress={() => navigation.push('Details', { animeId: rel.id })}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: rel.coverImage }} style={S.relImg} resizeMode="cover" />
                  <View style={{ flex: 1, justifyContent: 'center', paddingLeft: 4 }}>
                    <Text style={S.relType}>{rel.relationType}</Text>
                    <Text style={S.relTitle} numberOfLines={1}>{rel.title}</Text>
                    <Text style={S.relMeta}>{rel.format}  {rel.year}</Text>
                  </View>
                </TouchableOpacity>
              )) : (
                <View style={S.emptyEp}>
                  <Text style={S.emptyEpTitle}>No related media found.</Text>
                </View>
              )}
            </View>
          )}

          {/* ── MORE LIKE THIS ── */}
          {activeTab === 'More like this' && (
            <View>
              {data.recommendations.length > 0 ? data.recommendations.map(rec => (
                <TouchableOpacity
                  key={`rec-${rec.id}`}
                  style={S.relCard}
                  onPress={() => navigation.push('Details', { animeId: rec.id })}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: rec.coverImage }} style={[S.relImg, { aspectRatio: 3 / 4, height: 100 }]} resizeMode="cover" />
                  <View style={{ flex: 1, justifyContent: 'center', paddingLeft: 4 }}>
                    <Text style={S.relTitle} numberOfLines={2}>{rec.title}</Text>
                    <Text style={S.relMeta}>{[rec.format, rec.season, rec.year].filter(Boolean).join('  ')}</Text>
                  </View>
                </TouchableOpacity>
              )) : (
                <View style={S.emptyEp}>
                  <Text style={S.emptyEpTitle}>No recommendations found.</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

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
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  loadingHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  iconBtn: { padding: 4 },
  bannerWrap: { width, height: 200, position: 'relative' },
  banner: { width: '100%', height: '100%', opacity: 0.8 },
  heroInfo: { paddingHorizontal: 20, marginTop: -40 },
  coverWrap: {
    width: 112, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.8, shadowRadius: 16, elevation: 16,
  },
  cover: { width: 112, height: 160 },
  upcomingBadge: { alignSelf: 'flex-start', backgroundColor: '#eab308', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 6 },
  upcomingText: { color: '#000', fontSize: 10, fontWeight: '700' },
  title: { color: '#f3f4f6', fontSize: 20, fontWeight: '700', letterSpacing: 0.3, lineHeight: 26 },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  chipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  nativeTitle: { color: '#6b7280', fontSize: 13, marginBottom: 20, lineHeight: 18 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  watchNowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 999, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  watchNowText: { color: '#000', fontWeight: '700', fontSize: 14 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#151515', borderWidth: 1, borderColor: '#333',
    alignItems: 'center', justifyContent: 'center',
  },
  alBadge: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#2b2d42', borderWidth: 1, borderColor: '#333',
    alignItems: 'center', justifyContent: 'center',
  },
  alText: { color: '#60a5fa', fontWeight: '700', fontSize: 10 },
  malBadge: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(46,81,162,0.2)', borderWidth: 1, borderColor: 'rgba(46,81,162,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  malText: { color: '#60a5fa', fontWeight: '700', fontSize: 10 },
  tabScroll: { marginHorizontal: -20 },
  tab: { paddingHorizontal: 16, paddingVertical: 12, position: 'relative' },
  tabActive: {},
  tabText: { color: '#6b7280', fontSize: 14 },
  tabTextActive: { color: '#fff', fontWeight: '500' },
  tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: '#fff', borderRadius: 2 },
  statsGrid: {
    flexDirection: 'row', backgroundColor: '#111', borderRadius: 12,
    padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#1a1a1a',
  },
  statCell: { flex: 1, alignItems: 'center' },
  statLabel: { color: '#6b7280', fontSize: 11, marginBottom: 4 },
  statValue: { color: '#fff', fontWeight: '700', fontSize: 18 },
  infoBox: {
    backgroundColor: '#111', borderRadius: 12, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: '#1a1a1a', gap: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoLabel: { color: '#6b7280', fontSize: 13, width: 80, fontWeight: '500', flexShrink: 0 },
  infoValue: { color: '#d1d5db', fontSize: 13, flex: 1 },
  infoValueWrap: { flex: 1 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPill: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333', borderRadius: 999 },
  tagText: { color: '#d1d5db', fontSize: 12 },
  tagPillSm: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#151515', borderWidth: 1, borderColor: '#222', borderRadius: 999 },
  tagTextSm: { color: '#9ca3af', fontSize: 11 },
  charRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#111', borderRadius: 10, padding: 8, marginBottom: 8,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  charAvatar: { width: 40, height: 40, borderRadius: 4 },
  charName: { color: '#e5e7eb', fontSize: 12, fontWeight: '500' },
  charRole: { color: '#6b7280', fontSize: 10 },
  staffImg: { width: '100%', aspectRatio: 3 / 4, borderRadius: 10, backgroundColor: '#111', marginBottom: 6 },
  staffRole: { color: '#9ca3af', fontSize: 10 },
  staffName: { color: '#e5e7eb', fontSize: 12, fontWeight: '500', lineHeight: 16 },
  epCountBadge: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  epCountText: { color: '#d1d5db', fontSize: 13, fontWeight: '600' },
  epActionBtn: { padding: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#222', borderRadius: 12 },
  epCard: {
    flexDirection: 'row', gap: 12, padding: 8,
    backgroundColor: '#151515', borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: 'transparent',
  },
  epThumb: { width: 140, aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#222' },
  epNumBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  epNumText: { color: '#f3f4f6', fontSize: 11, fontWeight: '700' },
  epInfo: { flex: 1, justifyContent: 'center', paddingRight: 8 },
  epTitle: { color: '#e5e7eb', fontSize: 14, fontWeight: '600', marginBottom: 4, lineHeight: 18 },
  epOverview: { color: '#9ca3af', fontSize: 11, lineHeight: 16 },
  emptyEp: {
    alignItems: 'center', paddingVertical: 40,
    backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 16,
  },
  emptyEpTitle: { color: '#6b7280', fontSize: 14, fontWeight: '500' },
  emptyEpSub: { color: '#4b5563', fontSize: 12, marginTop: 4 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 },
  pageBtn: { padding: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10 },
  pageBtnText: { color: '#9ca3af', fontSize: 13 },
  pageNum: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#1a1a1a', borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a' },
  pageNumText: { color: '#e5e7eb', fontSize: 13, fontWeight: '700' },
  relCard: {
    flexDirection: 'row', gap: 16, padding: 8,
    backgroundColor: '#151515', borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  relImg: { width: 80, height: 80, borderRadius: 12 },
  relType: { color: '#6b7280', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  relTitle: { color: '#e5e7eb', fontSize: 15, fontWeight: '600', marginBottom: 4, lineHeight: 20 },
  relMeta: { color: '#6b7280', fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  saveMenu: { width: 280, backgroundColor: '#111', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#222' },
  saveMenuTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  saveMenuBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  saveMenuRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#444', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  saveMenuRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d4c356' },
  saveMenuBtnText: { color: '#d1d5db', fontSize: 15, fontWeight: '500' },
  likeGroup: {
    flexDirection: 'row', backgroundColor: '#1a1a1a', borderRadius: 999,
    borderWidth: 1, borderColor: '#2a2a2a', overflow: 'hidden',
  },
  likeBtn: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  reactionDivider: {
    width: 1, height: '60%', backgroundColor: '#2a2a2a',
  },
  reactionBtnDisactive: { backgroundColor: 'rgba(239,68,68,0.10)' },
  reactionCount: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  // Comments preview row
  commentPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20, borderWidth: 1, borderColor: '#1a1a1a' },
  commentPreviewLabel: { color: '#d1d5db', fontSize: 15, fontWeight: '700' },
  commentPreviewCount: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
});
