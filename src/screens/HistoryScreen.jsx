import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getHistory, clearHistory } from '../data/constants';
import { useAuth } from '../context/AuthContext';
import { getHistoryFromCloud, clearHistoryFromCloud } from '../api/firestore';

function HistoryCard({ item, onPress }) {
  const pct = item.duration > 0 ? Math.min(100, Math.round((item.progress / item.duration) * 100)) : 0;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.thumb}>
        <Image source={{ uri: item.coverImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {pct > 0 && <View style={styles.pctBadge}><Text style={styles.pctText}>{pct}%</Text></View>}
        <View style={styles.progBar}><View style={[styles.progFill, { width: `${pct}%` }]} /></View>
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{item.animeTitle}</Text>
        <Text style={styles.ep} numberOfLines={1}>{item.episodeTitle || `Episode ${item.episodeIndex + 1}`}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HistoryScreen({ navigation }) {
  const [history, setHistory] = useState([]);
  const { user } = useAuth();

  useFocusEffect(useCallback(() => {
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
  }, [user]));

  const handleClearHistory = () => Alert.alert('Clear History', 'Remove all watch history?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear All', style: 'destructive', onPress: async () => { 
        await clearHistory(); 
        if (user) await clearHistoryFromCloud(user.uid);
        setHistory([]); 
      } 
    },
  ]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Watch History</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {history.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClearHistory}>
              <Text style={styles.clearBtnText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* LIST OR EMPTY STATE */}
      <View style={{ flex: 1, zIndex: -1 }}>
        {history.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyState}>
            <Ionicons name="time-outline" size={48} color="#2a2a2a" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyText}>Nothing here yet :(</Text>
            <Text style={styles.emptySubText}>Anime you watch will appear here.</Text>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.listGrid}>
            {history.map((item, idx) => (
              <HistoryCard
                key={`${item.animeId}_${item.episodeIndex}_${idx}`}
                item={item}
                onPress={() => navigation.navigate('Details', {
                  animeId: item.animeId,
                  autoPlayEpisode: item.episodeIndex,
                })}
              />
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
  clearBtn: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#7f1d1d', borderRadius: 999 },
  clearBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '500' },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingBottom: 40, flexGrow: 1 },
  emptyText: { color: '#d1d5db', fontSize: 15, fontWeight: '500', marginBottom: 6 },
  emptySubText: { color: '#4b5563', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  listGrid: { padding: 16, gap: 12 },
  card: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 12, padding: 8, gap: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  thumb: { width: 130, height: 80, borderRadius: 8, backgroundColor: '#1a1a1a', overflow: 'hidden', position: 'relative' },
  pctBadge: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  pctText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  progBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  progFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  info: { flex: 1, justifyContent: 'center' },
  title: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  ep: { color: '#9ca3af', fontSize: 12 },
});
