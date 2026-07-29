import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getList } from '../data/constants';
import { useAuth } from '../context/AuthContext';
import { getListFromCloud } from '../api/firestore';

const { width } = Dimensions.get('window');

const TABS = [
  { label: 'All', icon: 'list-outline' },
  { label: 'Planning', icon: 'bookmark-outline' },
  { label: 'Watching', icon: 'play-outline' },
  { label: 'On hold', icon: 'pause-outline' },
  { label: 'Dropped', icon: 'close-outline' },
  { label: 'Finished', icon: 'checkmark-done-outline' },
  { label: 'Rewatching', icon: 'refresh-outline' },
];

const SORT_OPTIONS = ['Last Edited', 'Last Added', 'Title', 'My Score'];

export default function MyListScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('All');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState('Last Edited');
  const [sortOrder, setSortOrder] = useState('desc');
  const [listData, setListData] = useState([]);
  const { user } = useAuth();

  useFocusEffect(
    useCallback(() => {
      if (user) {
        // prefer cloud list when signed in
        getListFromCloud(user.uid)
          .then(cloud => {
            if (cloud.length > 0) setListData(cloud);
            else getList().then(setListData);
          })
          .catch(() => getList().then(setListData));
      } else {
        getList().then(data => setListData(data));
      }
    }, [user])
  );

  const filteredList = listData.filter(item => {
    if (activeTab === 'All') return true;
    if (activeTab === 'On hold' && item.status === 'On hold') return true;
    return item.status === activeTab;
  }).sort((a, b) => {
    let diff = 0;
    if (sortBy === 'Last Edited') diff = (b.savedAt || 0) - (a.savedAt || 0);
    else if (sortBy === 'Last Added') diff = (b.addedAt || b.savedAt || 0) - (a.addedAt || a.savedAt || 0);
    else if (sortBy === 'Title') diff = (a.animeTitle || '').localeCompare(b.animeTitle || '');
    else if (sortBy === 'My Score') diff = (b.score || 0) - (a.score || 0);
    return sortOrder === 'asc' ? -diff : diff;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Watchlist</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={22} color="#e5e7eb" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Search')}>
            <Ionicons name="search-outline" size={22} color="#e5e7eb" />
          </TouchableOpacity>
        </View>
      </View>

      {/* TABS */}
      <View style={{ flexGrow: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.label}
              onPress={() => setActiveTab(tab.label)}
              style={[styles.tab, activeTab === tab.label && styles.tabActive]}
            >
              <Text style={[styles.tabText, activeTab === tab.label && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ACTION BUTTONS */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="filter" size={18} color="#9ca3af" />
        </TouchableOpacity>
        <View style={{ position: 'relative', zIndex: 10 }}>
          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setIsSortMenuOpen(!isSortMenuOpen)}
          >
            <Text style={styles.sortBtnText}>{sortBy}</Text>
          </TouchableOpacity>
          {isSortMenuOpen && (
            <>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                onPress={() => setIsSortMenuOpen(false)}
              />
              <View style={styles.sortMenu}>
                {SORT_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.sortMenuItem, sortBy === opt && styles.sortMenuItemActive]}
                    onPress={() => { setSortBy(opt); setIsSortMenuOpen(false); }}
                  >
                    <Text style={[styles.sortMenuText, sortBy === opt && styles.sortMenuTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
        >
          <Ionicons
            name="swap-vertical"
            size={18}
            color="#9ca3af"
            style={{ transform: [{ scaleY: sortOrder === 'asc' ? -1 : 1 }] }}
          />
        </TouchableOpacity>
      </View>

      {/* LIST OR EMPTY STATE */}
      <View style={{ flex: 1, zIndex: -1 }}>
        {filteredList.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyState}>
            <Ionicons name="list-outline" size={48} color="#2a2a2a" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyText}>Nothing here yet :(</Text>
            <Text style={styles.emptySubText}>Anime you add to your list will appear here.</Text>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.listGrid}>
            {filteredList.map(item => (
              <TouchableOpacity key={item.animeId} style={styles.card} onPress={() => navigation.navigate('Details', { animeId: item.animeId })}>
                <Image source={{ uri: item.coverImage }} style={styles.cardImg} />
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.animeTitle}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <View style={[styles.statusDot, { backgroundColor: item.status === 'Watching' ? '#22c55e' : item.status === 'Planning' ? '#3b82f6' : item.status === 'On hold' ? '#f59e0b' : item.status === 'Dropped' ? '#ef4444' : item.status === 'Finished' ? '#8b5cf6' : '#14b8a6' }]} />
                    <Text style={styles.cardStatus}>{item.status}</Text>
                  </View>
                  <Text style={styles.cardFormat}>{item.format || 'TV'} • {item.year || '?'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  headerTitle: { color: '#fff', fontSize: 19, fontWeight: '500', letterSpacing: 0.3 },
  iconBtn: { padding: 4 },
  tabScroll: { flexGrow: 0 },
  tabRow: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' },
  tab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, backgroundColor: '#151515',
    borderWidth: 1, borderColor: '#2a2a2a',
    marginRight: 8,
  },
  tabActive: { backgroundColor: '#fff', borderColor: '#fff' },
  tabText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#000' },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingVertical: 8, zIndex: 10 },
  actionBtn: { padding: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 12 },
  sortBtn: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 12 },
  sortBtnText: { color: '#d1d5db', fontSize: 13, fontWeight: '500' },
  sortMenu: {
    position: 'absolute', top: '110%', right: 0, width: 144,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 12, overflow: 'hidden',
  },
  sortMenuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  sortMenuItemActive: { backgroundColor: '#222' },
  sortMenuText: { color: '#9ca3af', fontSize: 14 },
  sortMenuTextActive: { color: '#fff', fontWeight: '500' },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingBottom: 40, flexGrow: 1 },
  emptyText: { color: '#d1d5db', fontSize: 15, fontWeight: '500', marginBottom: 6 },
  emptySubText: { color: '#4b5563', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  listGrid: { padding: 16, gap: 12 },
  card: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 12, padding: 8, gap: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  cardImg: { width: 70, height: 100, borderRadius: 8, backgroundColor: '#222' },
  cardInfo: { flex: 1, justifyContent: 'center' },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  cardStatus: { color: '#d1d5db', fontSize: 13, fontWeight: '500' },
  cardFormat: { color: '#6b7280', fontSize: 12, marginTop: 'auto' },
});
