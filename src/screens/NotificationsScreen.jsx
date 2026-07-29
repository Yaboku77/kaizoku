import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function NotificationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [notifTab, setNotifTab] = useState('All');

  return (
    <View style={{ flex: 1, backgroundColor: '#050505' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, paddingTop: insets.top + 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 19, fontWeight: '500', letterSpacing: 0.3 }}>Notifications</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => { navigation.goBack(); navigation.navigate('Search'); }} style={{ padding: 4 }}>
            <Ionicons name="search-outline" size={22} color="#e5e7eb" />
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 4 }}>
            <Ionicons name="ellipsis-vertical" size={22} color="#e5e7eb" />
          </TouchableOpacity>
        </View>
      </View>
      {/* Tabs */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
        {['All', 'Unread', 'Mentions', 'Updates'].map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setNotifTab(tab)}
            style={{ flex: 1, paddingVertical: 14, alignItems: 'center', position: 'relative' }}
          >
            <Text style={{ color: notifTab === tab ? '#fff' : '#6b7280', fontSize: 14, fontWeight: '500' }}>{tab}</Text>
            {notifTab === tab && <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: '#fff', borderRadius: 2 }} />}
          </TouchableOpacity>
        ))}
      </View>
      {/* Empty State */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#151515', borderWidth: 1, borderColor: '#222', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Ionicons name="mail-outline" size={28} color="#9ca3af" />
        </View>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8, letterSpacing: 0.3 }}>You're all caught up!</Text>
        <Text style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', maxWidth: 250, lineHeight: 20 }}>Come back for notification on anime, mentions and more</Text>
      </View>
    </View>
  );
}
