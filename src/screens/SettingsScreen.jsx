import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Image, Modal, TextInput, ActivityIndicator, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../data/constants';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';
import EditProfileModal from './EditProfileModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchViewer } from '../api/anilist';

export default function SettingsScreen({ navigation }) {
  const { prefs, updatePrefs } = usePlayer();
  const { user, signOut }      = useAuth();
  const { openAuthModal }      = useAuthModal();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [qualityExpanded, setQualityExpanded] = useState(false);

  const [anilistUser, setAnilistUser] = useState(null);
  const [anilistToken, setAnilistToken] = useState(null);
  const [anilistModalOpen, setAnilistModalOpen] = useState(false);
  const [clientId, setClientId] = useState('20970'); // Default public client ID or user custom ID
  const [manualToken, setManualToken] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadAniListUser();
  }, []);

  const loadAniListUser = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('@anilist_token');
      const storedUser = await AsyncStorage.getItem('@anilist_user');
      if (storedToken) setAnilistToken(storedToken);
      if (storedUser) setAnilistUser(JSON.parse(storedUser));
    } catch (e) {
      console.error('Failed to load AniList user', e);
    }
  };

  const handleConnectWithToken = async (token) => {
    if (!token) return;
    setConnecting(true);
    try {
      const viewerData = await fetchViewer(token);
      await AsyncStorage.setItem('@anilist_token', token);
      await AsyncStorage.setItem('@anilist_user', JSON.stringify(viewerData));
      setAnilistToken(token);
      setAnilistUser(viewerData);
      setAnilistModalOpen(false);
      setManualToken('');
      Alert.alert('Success', `Connected to AniList as ${viewerData.name}!`);
    } catch (error) {
      Alert.alert('Connection Failed', error.message || 'Could not verify token. Please check it and try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectAniList = async () => {
    Alert.alert('Disconnect AniList', 'Are you sure you want to disconnect your AniList account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            await AsyncStorage.removeItem('@anilist_token');
            await AsyncStorage.removeItem('@anilist_user');
            setAnilistToken(null);
            setAnilistUser(null);
            Alert.alert('Disconnected', 'Your AniList account has been disconnected.');
          } catch (e) {
            Alert.alert('Error', 'Failed to disconnect account.');
          }
        }
      }
    ]);
  };

  const handleChromeAuth = () => {
    const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&response_type=token`;
    Linking.openURL(authUrl).catch(() => {
      Alert.alert('Error', 'Failed to open Chrome or Web Browser.');
    });
  };

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

        {/* ── AniList Connection ───────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>AniList Integration</Text>
        <View style={styles.section}>
          {anilistUser ? (
            <View style={styles.settingRow}>
              {anilistUser.avatar?.medium ? (
                <Image source={{ uri: anilistUser.avatar.medium }} style={styles.anilistAvatar} />
              ) : (
                <View style={[styles.anilistAvatar, { backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                    {anilistUser.name?.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.settingLabel}>{anilistUser.name}</Text>
                <Text style={styles.settingSubtitle}>Connected</Text>
              </View>
              <TouchableOpacity onPress={handleDisconnectAniList} style={styles.disconnectBtn}>
                <Text style={styles.disconnectBtnText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.settingRow, { borderBottomWidth: 0 }]} onPress={() => setAnilistModalOpen(true)}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Connect AniList Account</Text>
                <Text style={styles.settingSubtitle}>Post comments and activities directly to AniList</Text>
              </View>
              <Ionicons name="link-outline" size={20} color="#a78bfa" />
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

          {/* Default Quality Setting */}
          <TouchableOpacity 
            style={[styles.settingRow, { borderBottomWidth: qualityExpanded ? 0 : 1 }]} 
            onPress={() => setQualityExpanded(!qualityExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Default Quality</Text>
              <Text style={styles.settingSubtitle}>
                {prefs.defaultQuality ? (prefs.defaultQuality === 'Auto' ? 'Auto' : `${prefs.defaultQuality}p`) : 'Auto'}
              </Text>
            </View>
            <Ionicons name={qualityExpanded ? "chevron-up" : "chevron-down"} size={16} color="#4b5563" />
          </TouchableOpacity>
          {qualityExpanded && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              {['Auto', '1080', '720', '480', '360'].map(q => {
                const isSelected = (prefs.defaultQuality || 'Auto') === String(q);
                return (
                  <TouchableOpacity 
                    key={q} 
                    style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10 }}
                    onPress={() => { updatePrefs({ defaultQuality: q }); setQualityExpanded(false); }}
                  >
                    <Text style={{ color: isSelected ? '#a78bfa' : '#e5e7eb', fontSize: 14, fontWeight: isSelected ? '700' : '400' }}>
                      {q === 'Auto' ? 'Auto' : `${q}p`}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color="#a78bfa" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
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

      {/* ── AniList Connection Modal ────────────────────────────────────── */}
      <Modal
        visible={anilistModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAnilistModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Connect AniList</Text>
              <TouchableOpacity onPress={() => setAnilistModalOpen(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 20 }}>
              <Text style={styles.modalDescription}>
                By connecting your account, comments you post on Kaizoku can be shared directly to your AniList activity feed!
              </Text>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Option A: Authenticate via Chrome</Text>
                <Text style={styles.modalLabel}>Client ID</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter AniList Client ID"
                  placeholderTextColor="#6b7280"
                  value={clientId}
                  onChangeText={setClientId}
                  keyboardType="numeric"
                />
                <Text style={styles.modalHelper}>
                  We will open your web browser. Once authorized, copy the access token from the browser address bar and paste it below.
                </Text>
                <TouchableOpacity
                  style={[styles.modalSubmitBtn, !clientId && styles.disabledBtn]}
                  disabled={!clientId}
                  onPress={handleChromeAuth}
                >
                  <Text style={styles.modalSubmitBtnText}>Open Browser</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalDivider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>AND THEN PASTE TOKEN</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Enter Access Token</Text>
                <Text style={styles.modalLabel}>Access Token</Text>
                <TextInput
                  style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Paste AniList Access Token"
                  placeholderTextColor="#6b7280"
                  value={manualToken}
                  onChangeText={setManualToken}
                  multiline
                />
                <TouchableOpacity
                  onPress={() => Linking.openURL(`https://anilist.co/api/v2/oauth/authorize?client_id=20970&response_type=token`)}
                  style={styles.generateTokenBtn}
                >
                  <Text style={styles.generateTokenBtnText}>Generate Token (Default Client)</Text>
                  <Ionicons name="open-outline" size={14} color="#a78bfa" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitBtn, !manualToken.trim() && styles.disabledBtn]}
                  disabled={!manualToken.trim() || connecting}
                  onPress={() => handleConnectWithToken(manualToken.trim())}
                >
                  {connecting ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.modalSubmitBtnText}>Verify & Connect</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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

  // AniList Specific
  anilistAvatar:   { width: 40, height: 40, borderRadius: 20 },
  disconnectBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)' },
  disconnectBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },

  // Modals styling
  modalBackdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent:    { backgroundColor: '#171717', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:      { color: '#fff', fontSize: 20, fontWeight: '800' },
  modalCloseBtn:   { padding: 4 },
  modalDescription: { color: '#9ca3af', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  modalSection:    { backgroundColor: '#222', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#333' },
  modalSectionTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  modalLabel:      { color: '#9ca3af', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase' },
  modalInput:      { backgroundColor: '#111', color: '#fff', borderRadius: 8, padding: 10, fontSize: 14, borderWidth: 1, borderColor: '#333', marginBottom: 8 },
  modalHelper:     { color: '#6b7280', fontSize: 11, lineHeight: 16, marginBottom: 12 },
  modalSubmitBtn:  { backgroundColor: '#fff', paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalSubmitBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  disabledBtn:     { backgroundColor: '#333', opacity: 0.5 },
  modalDivider:    { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  dividerLine:     { flex: 1, height: 1, backgroundColor: '#333' },
  dividerText:     { color: '#4b5563', paddingHorizontal: 12, fontSize: 12, fontWeight: '700' },
  generateTokenBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  generateTokenBtnText: { color: '#a78bfa', fontSize: 13, fontWeight: '600' },

  // Webview Header
  webviewHeader:   { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#222', backgroundColor: '#000', gap: 14 },
  webviewBackBtn:  { padding: 4 },
  webviewTitle:    { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 }
});
