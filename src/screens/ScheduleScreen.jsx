import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedShimmer } from '../components/SharedComponents';

const SCHEDULE_QUERY = `
query($airingAt_greater: Int, $airingAt_lesser: Int) {
  Page(page: 1, perPage: 50) {
    airingSchedules(airingAt_greater: $airingAt_greater, airingAt_lesser: $airingAt_lesser, sort: TIME) {
      id airingAt episode
      media { id title { english romaji } coverImage { large } }
    }
  }
}`;

function getDayDates() {
  const days = [];
  const now = new Date();
  for (let i = -1; i <= 5; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function ScheduleScreen({ navigation }) {
  const scheduleDates = getDayDates();
  const [selectedDate, setSelectedDate] = useState(scheduleDates[1]);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const update = () => {
      setCurrentTime(new Date().toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
      }));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { fetchSchedule(selectedDate); }, [selectedDate]);

  const fetchSchedule = async (day) => {
    setLoading(true);
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end = new Date(day); end.setHours(23, 59, 59, 999);
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: SCHEDULE_QUERY,
          variables: {
            airingAt_greater: Math.floor(start.getTime() / 1000),
            airingAt_lesser: Math.floor(end.getTime() / 1000)
          }
        }),
      });
      const json = await res.json();
      setSchedule(json.data?.Page?.airingSchedules || []);
    } catch (e) {
      console.log('Schedule fetch failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const format24h = (unix) => {
    const d = new Date(unix * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const format12h = (unix) => {
    const d = new Date(unix * 1000);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Notifications')}>
              <Ionicons name="notifications-outline" size={22} color="#e5e7eb" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Search')}>
              <Ionicons name="search-outline" size={22} color="#e5e7eb" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Estimated Schedule</Text>
          <Text style={styles.headerTime}>{currentTime || 'Loading...'}</Text>
        </View>
      </View>

      {/* DATE SELECTOR */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dateScroll}
        contentContainerStyle={styles.dateRow}
      >
        {scheduleDates.map((dateObj, idx) => {
          const isSelected = selectedDate.toDateString() === dateObj.toDateString();
          const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
          const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <TouchableOpacity
              key={idx}
              onPress={() => setSelectedDate(dateObj)}
              style={[styles.dateChip, isSelected && styles.dateChipActive]}
            >
              <Text style={[styles.dateDayName, isSelected && styles.dateDayNameActive]}>{dayName}</Text>
              <Text style={[styles.dateMonthDay, isSelected && styles.dateMonthDayActive]}>{monthDay}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* TIMELINE LIST */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.timelineContent}>
        {loading ? (
          // Skeleton rows
          [1, 2, 3, 4, 5].map((i, index) => (
            <View key={`skel-${i}`} style={styles.scheduleRow}>
              <AnimatedShimmer style={{ width: 48, height: 20, borderRadius: 4 }} />
              <View style={[styles.card, { overflow: 'hidden' }]}>
                <AnimatedShimmer style={{ width: 70, height: '100%' }} />
                <View style={{ flex: 1, padding: 12, gap: 8 }}>
                  <AnimatedShimmer style={{ height: 16, width: '75%', borderRadius: 4 }} />
                  <AnimatedShimmer style={{ height: 12, width: '40%', borderRadius: 4 }} />
                </View>
              </View>
            </View>
          ))
        ) : schedule.length === 0 ? (
          <Text style={styles.emptyText}>No schedule available for this date.</Text>
        ) : (
          schedule.map((item, index) => (
            <View key={item.id} style={styles.scheduleRow}>
              {/* Time */}
              <Text style={styles.airTime}>{format24h(item.airingAt)}</Text>
              {/* Card */}
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('Details', { animeId: item.media.id })}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: item.media.coverImage.large }}
                  style={styles.cardImage}
                  resizeMode="cover"
                />
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.media.title.english || item.media.title.romaji}
                  </Text>
                  <Text style={styles.cardDesc} numberOfLines={1}>
                    Ep {item.episode} {item.airingAt * 1000 > Date.now() ? 'airs' : 'aired'} at {format12h(item.airingAt)}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  header: { backgroundColor: '#050505' },
  headerTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  iconBtn: { padding: 4 },
  headerTitleRow: { paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 0.3 },
  headerTime: { color: '#9ca3af', fontSize: 13, fontFamily: 'monospace', letterSpacing: 0.5, marginTop: 4 },
  dateScroll: { borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  dateRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 10, flexDirection: 'row', alignItems: 'center' },
  dateChip: {
    width: 72, height: 72, borderRadius: 16,
    backgroundColor: '#151515', borderWidth: 1, borderColor: '#222',
    alignItems: 'center', justifyContent: 'center',
  },
  dateChipActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
    shadowColor: '#fff', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8,
    elevation: 4,
  },
  dateDayName: { color: '#e5e7eb', fontSize: 17, fontWeight: '700' },
  dateDayNameActive: { color: '#000' },
  dateMonthDay: { color: '#9ca3af', fontSize: 12, fontWeight: '500', marginTop: 4 },
  dateMonthDayActive: { color: '#4b5563', fontWeight: '600' },
  timelineContent: { paddingTop: 30, paddingLeft: 20, paddingRight: 20, paddingBottom: 120, minHeight: 300 },
  scheduleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20,
    paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: '#fff',
    marginLeft: 0,
  },
  airTime: { color: '#fff', fontSize: 15, fontWeight: '700', width: 48, letterSpacing: 0.3 },
  card: {
    flex: 1, flexDirection: 'row', height: 95,
    backgroundColor: '#151515', borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: '#222',
  },
  cardImage: { width: 70, height: '100%', backgroundColor: '#222' },
  cardInfo: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { color: '#e5e7eb', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  cardDesc: { color: '#9ca3af', fontSize: 11 },
  emptyText: { color: '#6b7280', textAlign: 'center', paddingTop: 80, fontWeight: '500' },
});
