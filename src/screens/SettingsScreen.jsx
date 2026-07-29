import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../data/constants';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';
import EditProfileModal from './EditProfileModal';

export default function SettingsScreen({ navigation }) {
  const { prefs, updatePrefs } = usePlayer();
  const { user, signOut }      = useAuth();
  const { openAuthModal }      = useAuthModal();
  const [editModalOpen, setEditModalOpen] = useState(false);

  const toggle = (key) => updatePrefs({ [key]: !prefs[key] });

  const SettingRow = ({ label, subtitle, settingKey }) => (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      <Switch
        value={!!prefs[settingKey]}
        onValueChange={() => toggle(settingKey)}
        trackColor={{ false: '#333', true: '#7c3aed' }}
        thumbColor={prefs[settingKey] ? '#fff' : '#999'}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* ── Account ──────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.section}>
          {user ? (
            <>
              {/* Profile preview row */}
              <TouchableOpacity
                style={[styles.settingRow, { gap: 14 }]}
                onPress={() => setEditModalOpen(true)}
              >
                {user.photoURL ? (
                  <Image source={{ uri: user.photoURL }} style={styles.settingsAvatar} />
                ) : (
                  <View style={[styles.settingsAvatar, { backgroundColor: '#2e1065', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
                      {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>{user.displayName || 'Anime Fan'}</Text>
                  <Text style={styles.settingSubtitle}>{user.email}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#4b5563" />
              </TouchableOpacity>

              {/* Edit profile row */}
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => setEditModalOpen(true)}
              >
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Edit Profile</Text>
                  <Text style={styles.settingSubtitle}>Change name and profile photo</Text>
                </View>
                <Ionicons name="person-circle-outline" size={20} color="#a78bfa" />
              </TouchableOpacity>

              {/* Sign out row */}
              <TouchableOpacity
                style={[styles.settingRow, { borderBottomWidth: 0 }]}
                onPress={() => signOut()}
              >
                <Text style={[styles.settingLabel, { color: '#ef4444' }]}>Sign Out</Text>
                <Ionicons name="log-out-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.settingRow, { borderBottomWidth: 0 }]}
              onPress={openAuthModal}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Sign In</Text>
                <Text style={styles.settingSubtitle}>Sync watch history and settings across devices</Text>
              </View>
              <Ionicons name="log-in-outline" size={18} color="#a78bfa" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Playback ─────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Playback</Text>
        <View style={styles.section}>
          <SettingRow label="Auto Play"   subtitle="Autoplay videos on open"               settingKey="autoPlay" />
          <SettingRow label="Auto Next"   subtitle="Automatically play next episode"        settingKey="autoNext" />
          <SettingRow label="Auto Skip"   subtitle="Skip intros and recaps"                 settingKey="autoSkip" />
          <SettingRow label="Ambient Mode" subtitle="Match background to video"             settingKey="ambientMode" />
          <SettingRow label="Miniplayer"  subtitle="Enable picture-in-picture mode"         settingKey="miniplayer" />
        </View>

        {/* ── Content ──────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Content</Text>
        <View style={styles.section}>
          <SettingRow label="Hide Adult Content" subtitle="Filter 18+ content from results" settingKey="hideAdult" />
        </View>

        {/* ── Cloud sync note ──────────────────────────────────────────────── */}
        {user && (
          <View style={styles.syncNote}>
            <Ionicons name="cloud-done-outline" size={14} color="#22c55e" />
            <Text style={styles.syncNoteText}>Settings synced to your account</Text>
          </View>
        )}

        {/* ── About ────────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Data Source</Text>
            <Text style={styles.infoValue}>AniList API</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Owned by</Text>
            <Text style={styles.infoValue}>Kaizoku</Text>
          </View>
        </View>
      </ScrollView>
      {/* ── Edit Profile Modal ─────────────────────────────────────────── */}
      <EditProfileModal visible={editModalOpen} onClose={() => setEditModalOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.bg },
  header:          { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  headerTitle:     { color: '#fff', fontSize: 20, fontWeight: '800' },
  sectionLabel:    { color: '#6b7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  section:         { marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  settingRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  settingInfo:     { flex: 1, marginRight: 12 },
  settingLabel:    { color: '#e5e7eb', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  settingSubtitle: { color: '#6b7280', fontSize: 12 },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLabel:       { color: '#9ca3af', fontSize: 14 },
  infoValue:       { color: '#e5e7eb', fontSize: 14, fontWeight: '600' },
  syncNote:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 2 },
  syncNoteText:    { color: '#22c55e', fontSize: 12 },
  settingsAvatar:  { width: 46, height: 46, borderRadius: 23 },
});
