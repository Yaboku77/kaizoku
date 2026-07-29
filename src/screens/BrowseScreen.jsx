import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, Image, ActivityIndicator, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedShimmer } from '../components/SharedComponents';
import { GENRES, FORMATS, SORTS, STATUSES, SEASONS, TAGS, COUNTRIES, SOURCES, YEARS } from '../data/constants';
import { BROWSE_QUERY } from '../data/queries';

// All filter rows
const FILTER_ROWS = [
  { label: 'Genres', field: 'genre', options: GENRES },
  { label: 'Format', field: 'format', options: FORMATS.map(f => typeof f === 'object' ? f.label : f) },
  { label: 'Year', field: 'seasonYear', options: YEARS },
  { label: 'Sort', field: 'sort', options: SORTS.map(s => typeof s === 'object' ? s.label : s) },
  { label: 'Season', field: 'season', options: SEASONS.map(s => typeof s === 'object' ? s.label : s) },
  { label: 'Airing Status', field: 'status', options: STATUSES.map(s => typeof s === 'object' ? s.label : s) },
  { label: 'Tags', field: 'tag', options: TAGS },
  { label: 'Country of Origin', field: 'countryOfOrigin', options: COUNTRIES.map(c => typeof c === 'object' ? c.label : c) },
  { label: 'Source', field: 'source', options: SOURCES.map(s => typeof s === 'object' ? s.label : s) },
];

function FilterSelect({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={filterStyles.wrapper}>
      <Text style={filterStyles.label}>{label}</Text>
      <TouchableOpacity style={filterStyles.select} onPress={() => setOpen(!open)}>
        <Text style={filterStyles.selectValue} numberOfLines={1}>{value || 'Any'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color="#9ca3af" />
      </TouchableOpacity>
      {open && (
        <ScrollView style={filterStyles.dropdown} nestedScrollEnabled={true}>
          <TouchableOpacity style={filterStyles.option} onPress={() => { onChange(''); setOpen(false); }}>
            <Text style={filterStyles.optionText}>Any</Text>
          </TouchableOpacity>
          {options.map(opt => (
            <TouchableOpacity key={opt} style={filterStyles.option} onPress={() => { onChange(opt); setOpen(false); }}>
              <Text style={[filterStyles.optionText, value === opt && filterStyles.optionActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const filterStyles = StyleSheet.create({
  wrapper: { flex: 1 },
  label: { color: '#9ca3af', fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 },
  select: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#151515', borderWidth: 1, borderColor: '#222',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  selectValue: { color: '#e5e7eb', fontSize: 13, flex: 1 },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 10, maxHeight: 200, overflow: 'hidden',
  },
  option: { paddingHorizontal: 12, paddingVertical: 10 },
  optionText: { color: '#9ca3af', fontSize: 13 },
  optionActive: { color: '#fff', fontWeight: '600' },
});

export default function BrowseScreen({ navigation, route }) {
  const [searchText, setSearchText] = useState('');
  const initialFilters = route?.params?.initialFilters || {};
  const [filters, setFilters] = useState({
    genre: '', format: '', sort: '', status: '', seasonYear: '', season: '', tag: '', countryOfOrigin: '', source: '',
    ...initialFilters
  });

  useEffect(() => {
    if (route?.params?.initialFilters) {
      setFilters(prev => ({ ...prev, ...route.params.initialFilters }));
      setIsFiltersOpen(true);
      navigation.setParams({ initialFilters: undefined });
    }
  }, [route?.params?.initialFilters]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFiltersOpen, setIsFiltersOpen] = useState(Object.keys(initialFilters).length > 0);
  const searchTimeout = useRef(null);

  useEffect(() => { fetchBrowse(1, true); }, [filters]);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchBrowse(1, true), 500);
    return () => clearTimeout(searchTimeout.current);
  }, [searchText]);

  const fetchBrowse = async (pageNum = 1, reset = false) => {
    if (loading && !reset) return;
    setLoading(true);
    try {
      const getVal = (list, label) => list.find(x => x.label === label)?.val || label;

      const vars = {
        page: pageNum,
        sort: [filters.sort ? getVal(SORTS, filters.sort) : 'POPULARITY_DESC'],
        search: searchText || undefined,
        genre: filters.genre || undefined,
        tag: filters.tag || undefined,
        format: filters.format ? getVal(FORMATS, filters.format) : undefined,
        status: filters.status ? getVal(STATUSES, filters.status) : undefined,
        season: filters.season ? getVal(SEASONS, filters.season) : undefined,
        seasonYear: filters.seasonYear ? parseInt(filters.seasonYear) : undefined,
        countryOfOrigin: filters.countryOfOrigin ? getVal(COUNTRIES, filters.countryOfOrigin) : undefined,
        source: filters.source ? getVal(SOURCES, filters.source) : undefined,
      };
      Object.keys(vars).forEach(k => vars[k] === undefined && delete vars[k]);
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: BROWSE_QUERY, variables: vars }),
      });
      const json = await res.json();
      if (json.data?.Page) {
        const items = json.data.Page.media.map(m => ({
          id: m.id,
          title: m.title.english || m.title.romaji,
          image: m.coverImage.extraLarge,
          type: m.format === 'TV' ? 'TV Show' : (m.format || 'TV'),
          year: m.seasonYear,
          status: m.status,
        }));
        setResults(reset ? items : prev => [...prev, ...items]);
        setHasMore(json.data.Page.pageInfo.hasNextPage);
        setPage(pageNum);
      }
    } catch (e) {
      console.log('Browse fetch failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => { if (hasMore && !loading) fetchBrowse(page + 1); };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const BrowseCard = ({ item }) => {
    const isReleasing = item.status === 'RELEASING';
    return (
      <TouchableOpacity
        style={cardStyles.card}
        onPress={() => navigation.navigate('Details', { animeId: item.id })}
        activeOpacity={0.8}
      >
        <View style={cardStyles.imageWrap}>
          <Image source={{ uri: item.image }} style={cardStyles.image} resizeMode="cover" />
        </View>
        <View style={cardStyles.meta}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 4 }}>
            {isReleasing && <View style={cardStyles.greenDot} />}
            <Text style={cardStyles.type} numberOfLines={1}>{item.type}</Text>
          </View>
          <Text style={cardStyles.year} numberOfLines={1}>{item.year}</Text>
        </View>
        <Text style={cardStyles.title} numberOfLines={2}>{item.title}</Text>
      </TouchableOpacity>
    );
  };

  const cardStyles = StyleSheet.create({
    card: { flex: 1, margin: 4 },
    imageWrap: { width: '100%', aspectRatio: 3 / 4.2, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 6 },
    image: { width: '100%', height: '100%', backgroundColor: '#111' },
    meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingHorizontal: 2 },
    type: { color: '#9ca3af', fontSize: 10, flex: 1 },
    year: { color: '#9ca3af', fontSize: 10 },
    title: { color: '#e5e7eb', fontSize: 12.5, fontWeight: '600', lineHeight: 17, paddingHorizontal: 2 },
    greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Browse</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={{ padding: 4 }}>
            <Ionicons name="notifications-outline" size={22} color="#e5e7eb" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Search')} style={{ padding: 4 }}>
            <Ionicons name="search-outline" size={22} color="#e5e7eb" />
          </TouchableOpacity>
        </View>
      </View>

      {/* SEARCH + FILTER ROW */}
      <View style={styles.searchSection}>
        <Text style={styles.searchLabel}>Search</Text>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color="#6b7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search anime..."
              placeholderTextColor="#6b7280"
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity
            style={[styles.filterBtn, isFiltersOpen && styles.filterBtnActive]}
            onPress={() => setIsFiltersOpen(!isFiltersOpen)}
          >
            <Ionicons name="filter" size={20} color={isFiltersOpen ? '#000' : '#fff'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* FILTERS GRID */}
      {isFiltersOpen && (
        <View style={styles.filtersGrid}>
          {Array.from({ length: Math.ceil(FILTER_ROWS.length / 2) }).map((_, i) => (
            <View key={i} style={styles.filterRow}>
              {FILTER_ROWS.slice(i * 2, i * 2 + 2).map((row) => (
                <FilterSelect
                  key={row.label}
                  label={row.label}
                  value={filters[row.field]}
                  options={row.options}
                  onChange={v => handleFilterChange(row.field, v)}
                />
              ))}
              {FILTER_ROWS.slice(i * 2, i * 2 + 2).length === 1 && <View style={{ flex: 1 }} />}
            </View>
          ))}
        </View>
      )}

      {/* RESULTS GRID */}
      <FlatList
        data={results}
        keyExtractor={(item, idx) => `${item.id}-${idx}`}
        numColumns={3}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={loading && results.length === 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <AnimatedShimmer key={i} style={{ width: '31%', aspectRatio: 3 / 4.2, borderRadius: 14, margin: 4 }} />
            ))}
          </View>
        ) : null}
        ListFooterComponent={loading && results.length > 0 ? <ActivityIndicator size="small" color="#fff" style={{ margin: 20 }} /> : null}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={40} color="#4b5563" />
            <Text style={styles.emptyText}>No results found.</Text>
            <Text style={styles.emptySubText}>Try adjusting your filters.</Text>
          </View>
        ) : null}
        renderItem={({ item }) => <BrowseCard item={item} />}
      />
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
  searchSection: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 0 },
  searchLabel: { color: '#e5e7eb', fontSize: 15, fontWeight: '600', marginBottom: 12 },
  searchRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#151515', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#222',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  filterBtn: {
    width: 48, height: 48, backgroundColor: '#151515',
    borderRadius: 12, borderWidth: 1, borderColor: '#222',
    alignItems: 'center', justifyContent: 'center',
  },
  filterBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  filtersGrid: { paddingHorizontal: 20, gap: 20, marginBottom: 20, zIndex: 100 },
  filterRow: { flexDirection: 'row', gap: 16 },
  grid: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { color: '#6b7280', fontSize: 15, fontWeight: '500' },
  emptySubText: { color: '#4b5563', fontSize: 12 },
});
