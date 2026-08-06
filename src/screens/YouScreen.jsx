import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getHistory, clearHistory, getList } from '../data/constants';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';
import { clearHistoryFromCloud, getHistoryFromCloud, getListFromCloud } from '../api/firestore';
import EditProfileModal from './EditProfileModal';

// ─── History card ─────────────────────────────────────────────────────────────
function HistoryCard({ item, onPress }) {
  const pct = item.duration > 0 ? Math.min(100, Math.round((item.progress / item.duration) * 100)) : 0;
  return (
    <TouchableOpacity style={ST.hCard} onPress={onPress} activeOpacity={0.75}>
      <View style={ST.hThumb}>
        <Image source={{ uri: item.coverImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {pct > 0 && <View style={ST.hPctBadge}><Text style={ST.hPctText}>{pct}%</Text></View>}
        <View style={ST.hProgBar}><View style={[ST.hProgFill, { width: `${pct}%` }]} /></View>
      </View>
      <Text style={ST.hTitle} numberOfLines={1}>{item.animeTitle}</Text>
      <Text style={ST.hEp} numberOfLines={1}>{item.episodeTitle || `Episode ${item.episodeIndex + 1}`}</Text>
    </TouchableOpacity>
  );
}

// ─── Watchlist card ───────────────────────────────────────────────────────────
function WatchlistCard({ item, onPress }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'Watching':   return '#22c55e';
      case 'Planning':   return '#3b82f6';
      case 'Finished':   return '#a855f7';
      case 'On hold':    return '#eab308';
      case 'Dropped':    return '#ef4444';
      case 'Rewatching': return '#06b6d4';
      default:           return '#6b7280';
    }
  };
  return (
    <TouchableOpacity style={ST.hCard} onPress={onPress} activeOpacity={0.75}>
      <View style={ST.hThumb}>
        <Image source={{ uri: item.coverImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[ST.hPctBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={ST.hPctText}>{item.status}</Text>
        </View>
      </View>
      <Text style={ST.hTitle} numberOfLines={1}>{item.animeTitle}</Text>
      <Text style={ST.hEp} numberOfLines={1}>{item.format || 'TV'} • {item.year || '?'}</Text>
    </TouchableOpacity>
  );
}

// ─── Avatar — shows photo, letter, or guest icon ──────────────────────────────
function Avatar({ user, onPress }) {
  const hasPhoto = !!user?.photoURL;
  const initial  = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <TouchableOpacity style={ST.avatarWrap} onPress={onPress} activeOpacity={user ? 0.8 : 1}>
      {hasPhoto ? (
        <Image source={{ uri: user.photoURL }} style={ST.avatarImg} />
      ) : user ? (
        <View style={[ST.avatar, { backgroundColor: '#2e1065' }]}>
          <Text style={ST.avatarLetter}>{initial}</Text>
        </View>
      ) : (
        <View style={ST.avatar}>
          <Ionicons name="person-outline" size={40} color="#6b7280" />
        </View>
      )}

      {/* Edit badge — only for signed-in users */}
      {user && (
        <View style={ST.editBadge}>
          <Ionicons name="camera" size={12} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function YouScreen({ navigation }) {
  const { play }          = usePlayer();
  const { user, signOut } = useAuth();
  const { openAuthModal } = useAuthModal();

  const [history,        setHistory]        = useState([]);
  const [watchlist,      setWatchlist]      = useState([]);
  const [editModalOpen,  setEditModalOpen]  = useState(false);

  useFocusEffect(useCallback(() => {
    if (user) {
      getHistoryFromCloud(user.uid)
        .then(cloud => {
          if (cloud.length > 0) setHistory(cloud);
          else getHistory().then(setHistory);
        })
        .catch(() => getHistory().then(setHistory));
        
      getListFromCloud(user.uid)
        .then(cloud => {
          if (cloud.length > 0) setWatchlist(cloud);
          else getList().then(setWatchlist);
        })
        .catch(() => getList().then(setWatchlist));
    } else {
      getHistory().then(setHistory);
      getList().then(setWatchlist);
    }
  }, [user]));

  const handleClearHistory = () => Alert.alert('Clear History', 'Remove all watch history?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Clear All', style: 'destructive',
      onPress: async () => {
        await clearHistory();
        if (user) await clearHistoryFromCloud(user.uid);
        setHistory([]);
      },
    },
  ]);

  const handleSignOut = () => Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOut(); } },
  ]);

  const totalMinutes = history.reduce((a, h) => a + Math.floor((h.progress || 0) / 60), 0);
  const uniqueAnime  = new Set(history.map(h => h.animeId)).size;

  return (
    <SafeAreaView style={ST.container} edges={['top']}>
      <View style={ST.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={ST.iconBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity style={ST.iconBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={22} color="#e5e7eb" />
          </TouchableOpacity>
          <TouchableOpacity style={ST.iconBtn} onPress={() => navigation.navigate('Search')}>
            <Ionicons name="search-outline" size={22} color="#e5e7eb" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={ST.iconBtn}>
            <Ionicons name="settings-outline" size={22} color="#e5e7eb" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── Profile ───────────────────────────────────────────────────── */}
        <View style={ST.profileSection}>
          <Avatar user={user} onPress={user ? () => setEditModalOpen(true) : undefined} />
          <View style={{ flex: 1, minWidth: 0 }}>
            {user ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={ST.profileName} numberOfLines={1}>
                    {user.displayName || 'Anime Fan'}
                  </Text>
                  <TouchableOpacity
                    style={ST.editProfileBtn}
                    onPress={() => setEditModalOpen(true)}
                  >
                    <Ionicons name="pencil-outline" size={12} color="#a78bfa" />
                    <Text style={ST.editProfileText}>Edit</Text>
                  </TouchableOpacity>
                </View>
                <Text style={ST.profileSub} numberOfLines={1}>{user.email}</Text>
              </>
            ) : (
              <>
                <Text style={ST.profileName}>Guest</Text>
                <Text style={ST.profileSub}>Sign in to sync your data</Text>
              </>
            )}
          </View>
        </View>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <View style={ST.statsRow}>
          <View style={ST.statItem}><Text style={ST.statValue}>{totalMinutes}+</Text><Text style={ST.statLabel}>Minutes{'\n'}Watched</Text></View>
          <View style={ST.statItem}><Text style={ST.statValue}>{history.length}</Text><Text style={ST.statLabel}>Episodes{'\n'}Watched</Text></View>
          <View style={ST.statItem}><Text style={ST.statValue}>{uniqueAnime}</Text><Text style={ST.statLabel}>Total{'\n'}Anime</Text></View>
        </View>

        {/* ── Watch History ─────────────────────────────────────────────── */}
        <View style={ST.section}>
          <View style={ST.sectionHeader}>
            <Text style={ST.sectionTitle}>Watch History</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {history.length > 0 && (
                <TouchableOpacity style={ST.clearBtn} onPress={handleClearHistory}>
                  <Text style={ST.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={ST.viewAllBtn} onPress={() => navigation.navigate('History')}>
                <Text style={ST.viewAllText}>View all</Text>
              </TouchableOpacity>
            </View>
          </View>
          {history.length === 0 ? (
            <View style={ST.emptyBox}>
              <Ionicons name="time-outline" size={36} color="#2a2a2a" style={{ marginBottom: 8 }} />
              <Text style={ST.emptyText}>Nothing here yet</Text>
              <Text style={ST.emptySubText}>Anime you watch will appear here</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 4 }}>
                {history.slice(0, 20).map((item, idx) => (
                  <HistoryCard
                    key={`${item.animeId}_${item.episodeIndex}_${idx}`}
                    item={item}
                    onPress={() => navigation.navigate('Details', {
                      animeId: item.animeId,
                      autoPlayEpisode: item.episodeIndex,
                    })}
                  />
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {/* ── Watchlist ─────────────────────────────────────────────────── */}
        <View style={ST.section}>
          <View style={ST.sectionHeader}>
            <Text style={ST.sectionTitle}>Watchlist</Text>
            <TouchableOpacity style={ST.viewAllBtn} onPress={() => navigation.navigate('My List')}>
              <Text style={ST.viewAllText}>View all</Text>
            </TouchableOpacity>
          </View>
          {watchlist.length === 0 ? (
            <View style={ST.emptyBox}>
              <Ionicons name="bookmark-outline" size={36} color="#2a2a2a" style={{ marginBottom: 8 }} />
              <Text style={ST.emptyText}>Nothing here yet</Text>
              <Text style={ST.emptySubText}>Anime you save will appear here</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 4 }}>
                {watchlist.slice(0, 20).map((item, idx) => (
                  <WatchlistCard
                    key={`${item.animeId}_${idx}`}
                    item={item}
                    onPress={() => navigation.navigate('Details', { animeId: item.animeId })}
                  />
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {/* ── Action links ──────────────────────────────────────────────── */}
        <View style={ST.links}>
          <TouchableOpacity style={ST.linkRow} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={22} color="#9ca3af" />
            <Text style={ST.linkText}>Settings</Text>
          </TouchableOpacity>

          {user ? (
            <>
              <TouchableOpacity style={ST.linkRow} onPress={() => setEditModalOpen(true)}>
                <Ionicons name="person-circle-outline" size={22} color="#a78bfa" />
                <Text style={[ST.linkText, { color: '#a78bfa' }]}>Edit Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ST.linkRow} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={22} color="#ef4444" />
                <Text style={[ST.linkText, { color: '#ef4444' }]}>Sign Out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={ST.linkRow} onPress={openAuthModal}>
              <Ionicons name="log-in-outline" size={22} color="#a78bfa" />
              <Text style={[ST.linkText, { color: '#a78bfa' }]}>Sign In / Sign Up</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ── Edit Profile Modal (bottom sheet) ────────────────────────── */}
      <EditProfileModal
        visible={editModalOpen}
        onClose={() => setEditModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const ST = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#050505' },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn:        { padding: 4 },

  // Profile
  profileSection: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 24, marginBottom: 28, paddingHorizontal: 20 },
  avatarWrap:     { width: 88, height: 88, borderRadius: 44, position: 'relative' },
  avatar:         { width: 88, height: 88, borderRadius: 44, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  avatarImg:      { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: 'rgba(167,139,250,0.4)' },
  avatarLetter:   { color: '#fff', fontSize: 36, fontWeight: '700' },
  editBadge:      { position: 'absolute', bottom: 2, right: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#050505' },
  profileName:    { color: '#fff', fontSize: 19, fontWeight: '700', marginBottom: 3, letterSpacing: 0.2 },
  profileSub:     { color: '#6b7280', fontSize: 13 },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(167,139,250,0.1)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)', borderRadius: 999 },
  editProfileText:{ color: '#a78bfa', fontSize: 11, fontWeight: '600' },

  // Stats
  statsRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 32, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1a1a1a', paddingVertical: 20 },
  statItem:       { flex: 1, alignItems: 'center' },
  statValue:      { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  statLabel:      { color: '#6b7280', fontSize: 11, textAlign: 'center', lineHeight: 15 },

  // Sections
  section:        { paddingHorizontal: 20, marginBottom: 28 },
  sectionHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle:   { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  viewAllBtn:     { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#151515', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 999 },
  viewAllText:    { color: '#d1d5db', fontSize: 12, fontWeight: '500' },
  clearBtn:       { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#7f1d1d', borderRadius: 999 },
  clearBtnText:   { color: '#ef4444', fontSize: 12, fontWeight: '500' },
  emptyBox:       { justifyContent: 'center', alignItems: 'center', paddingVertical: 28 },
  emptyText:      { color: '#6b7280', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  emptySubText:   { color: '#374151', fontSize: 12 },

  // Cards
  hCard:          { width: 130 },
  hThumb:         { width: 130, height: 80, borderRadius: 8, backgroundColor: '#1a1a1a', overflow: 'hidden', marginBottom: 7, position: 'relative' },
  hPctBadge:      { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  hPctText:       { color: '#fff', fontSize: 9, fontWeight: '700' },
  hProgBar:       { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  hProgFill:      { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  hTitle:         { color: '#e5e7eb', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  hEp:            { color: '#6b7280', fontSize: 11 },

  // Links
  links:          { paddingHorizontal: 20, gap: 28, marginTop: 8, paddingBottom: 48 },
  linkRow:        { flexDirection: 'row', alignItems: 'center', gap: 16 },
  linkText:       { color: '#d1d5db', fontSize: 15, fontWeight: '500', letterSpacing: 0.3 },
});
