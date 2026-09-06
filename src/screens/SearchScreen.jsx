import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { scrapeSubDubForTitles } from '../api/scrapers/search.scraper';

export default function SearchScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef(null);
  // Incremented on every new search so stale enrichments can be discarded
  const enrichGenRef = useRef(0);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)' }}>
        {/* Close Button */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16, paddingTop: insets.top + 16 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 20, marginTop: 4, flex: 1 }}>
          <View style={{ backgroundColor: '#151515', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 20, overflow: 'hidden', flex: searchResults.length > 0 || searchLoading ? 1 : 0 }}>
            {/* Search Input */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: (searchResults.length > 0 || searchLoading || searchQuery.length === 0) ? 1 : 0, borderBottomColor: '#2a2a2a' }}>
              {searchLoading ? (
                <ActivityIndicator size="small" color="#6b7280" style={{ marginRight: 12 }} />
              ) : (
                <Ionicons name="search-outline" size={18} color="#6b7280" style={{ marginRight: 12 }} />
              )}
              <TextInput
                autoFocus
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  clearTimeout(searchDebounceRef.current);
                  if (!text.trim()) { setSearchResults([]); setSearchLoading(false); return; }
                  setSearchLoading(true);
                  searchDebounceRef.current = setTimeout(async () => {
                    try {
                      const res = await fetch('https://graphql.anilist.co', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          query: `query($search:String){Page(perPage:8){media(search:$search,type:ANIME,sort:POPULARITY_DESC){id title{english romaji}coverImage{medium}format seasonYear status}}}`,
                          variables: { search: text.trim() }
                        })
                      });
                      const json = await res.json();
                      const results = json.data?.Page?.media || [];
                      const mapped = results.map(m => ({
                        id: m.id,
                        title: m.title.english || m.title.romaji,
                        image: m.coverImage.medium,
                        type: m.format === 'TV' ? 'TV Show' : (m.format || 'TV'),
                        year: m.seasonYear,
                        status: m.status,
                      }));
                      setSearchResults(mapped);
                      // Enrich with sub/dub from anikoto (fire-and-forget)
                      // Capture current generation so stale enrichments are discarded
                      const myGen = ++enrichGenRef.current;
                      const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
                      scrapeSubDubForTitles(mapped.map(c => c.title))
                        .then(subDubMap => {
                          // Discard if a newer search already ran
                          if (enrichGenRef.current !== myGen) return;
                          setSearchResults(prev => prev.map(c => {
                            if (c.hasSub !== undefined || c.hasDub !== undefined) return c;
                            const info = subDubMap[norm(c.title)];
                            return info ? { ...c, hasSub: info.hasSub, hasDub: info.hasDub } : c;
                          }));
                        })
                        .catch(() => {});
                    } catch (_) { setSearchResults([]); }
                    finally { setSearchLoading(false); }
                  }, 400);
                }}
                placeholder="Start searching..."
                placeholderTextColor="#6b7280"
                style={{ flex: 1, color: '#fff', fontSize: 15, padding: 0 }}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (searchQuery.trim()) {
                    navigation.replace('Browse', { searchQuery: searchQuery.trim() });
                  }
                }}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                  <Ionicons name="close-circle" size={18} color="#6b7280" />
                </TouchableOpacity>
              )}
            </View>
            {/* Live Results */}
            {searchQuery.trim().length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: '#d1d5db', fontSize: 14, fontWeight: '500' }}>What do you wanna watch today?</Text>
              </View>
            ) : searchResults.length === 0 && !searchLoading ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: '#6b7280', fontSize: 14 }}>No results found for "{searchQuery}"</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                {searchResults.map(anime => (
                  <TouchableOpacity
                    key={anime.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}
                    onPress={() => {
                      navigation.replace('Details', { animeId: anime.id });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ width: 40, height: 56, borderRadius: 8, backgroundColor: '#222', overflow: 'hidden' }}>
                      <Image source={{ uri: anime.image }} style={{ width: 40, height: 56 }} resizeMode="cover" />
                      {(anime.hasSub || anime.hasDub) && (
                        <View style={{ position: 'absolute', bottom: 3, left: 2, flexDirection: 'row', gap: 2 }}>
                          {anime.hasSub && (
                            <View style={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 }}>
                              <Text style={{ color: '#fff', fontSize: 7, fontWeight: '700', letterSpacing: 0.4 }}>SUB</Text>
                            </View>
                          )}
                          {anime.hasDub && (
                            <View style={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 }}>
                              <Text style={{ color: '#fff', fontSize: 7, fontWeight: '700', letterSpacing: 0.4 }}>DUB</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#e5e7eb', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{anime.title}</Text>
                      <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{[anime.type, anime.year].filter(Boolean).join(' • ')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#4b5563" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
