import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  Image, ActivityIndicator, Platform, KeyboardAvoidingView,
  ScrollView, Alert, Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';

const IMGBB_API_KEY = '37a30efe10d5c15e8893e7ef3cfd3496';

// ─── Upload image URI → imgbb → returns hosted URL ───────────────────────────
async function uploadToImgbb(localUri) {
  const formData = new FormData();
  formData.append('image', {
    uri: localUri,
    type: 'image/jpeg',
    name: 'avatar.jpg',
  });

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData,
  });
  const json = await res.json();

  if (!json.success) {
    throw new Error(json?.error?.message || 'imgbb upload failed');
  }
  // display_url is a direct image link (no expiry)
  return json.data.display_url;
}

export default function EditProfileModal({ visible, onClose }) {
  const { user, updateUserProfile } = useAuth();

  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);   // local URI (preview)
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill form when modal opens
  useEffect(() => {
    if (visible && user) {
      setName(user.displayName || '');
      setAvatarUri(null);
      setError('');
    }
  }, [visible, user]);

  // ── Pick image from gallery ───────────────────────────────────────────────
  const handlePickImage = async () => {
    // Ask permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library in Settings.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,   // crop to square
      aspect: [1, 1],        // enforce 1:1 square
      quality: 0.85,         // good quality JPEG
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  // ── Take photo with camera ────────────────────────────────────────────────
  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access in Settings.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  // ── Show picker options ───────────────────────────────────────────────────
  const handlePickerOptions = () => {
    Alert.alert('Change Profile Photo', 'Choose a source', [
      { text: 'Camera', onPress: handleCamera },
      { text: 'Photo Library', onPress: handlePickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    Keyboard.dismiss();
    if (!user) return;
    if (!name.trim()) { setError('Display name cannot be empty.'); return; }

    setSaving(true);
    setError('');
    try {
      let photoURL = user.photoURL || undefined;

      // Upload new avatar to imgbb if a new one was picked
      if (avatarUri) {
        setUploading(true);
        photoURL = await uploadToImgbb(avatarUri);
        setUploading(false);
      }

      await updateUserProfile({
        displayName: name.trim(),
        ...(photoURL !== undefined ? { photoURL } : {}),
      });

      onClose();
    } catch (e) {
      console.log('[EditProfile] save error:', e?.message);
      setError(e?.message || 'Failed to save profile. Try again.');
      setUploading(false);
    } finally {
      setSaving(false);
    }
  };

  // ── Current avatar source ─────────────────────────────────────────────────
  const currentPhotoURL = avatarUri || user?.photoURL;
  const initials = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <BlurView tint="dark" intensity={60} experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={S.overlay}>
        <KeyboardAvoidingView
          behavior="padding"
          style={S.sheet}
        >
          <View style={S.titleRow}>
            <Text style={S.title}>Edit Profile</Text>
            <TouchableOpacity style={S.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >

            {/* ── Avatar picker ───────────────────────────────────────── */}
            <View style={S.avatarSection}>
              <TouchableOpacity style={S.avatarWrap} onPress={handlePickerOptions} activeOpacity={0.8}>
                {currentPhotoURL ? (
                  <Image source={{ uri: currentPhotoURL }} style={S.avatarImg} />
                ) : (
                  <View style={S.avatarPlaceholder}>
                    <Text style={S.avatarInitial}>{initials}</Text>
                  </View>
                )}

                {/* Camera badge overlay */}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.65)']}
                  style={S.avatarOverlay}
                >
                  <Ionicons name="camera" size={22} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>

              <Text style={S.avatarHint}>Tap to change • Square image (512×512 recommended)</Text>

              {/* Quick action buttons */}
              <View style={S.pickerBtns}>
                <TouchableOpacity style={S.pickerBtn} onPress={handlePickImage}>
                  <Ionicons name="images-outline" size={18} color="#a78bfa" />
                  <Text style={S.pickerBtnText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={S.pickerBtn} onPress={handleCamera}>
                  <Ionicons name="camera-outline" size={18} color="#a78bfa" />
                  <Text style={S.pickerBtnText}>Camera</Text>
                </TouchableOpacity>
                {(avatarUri || user?.photoURL) && (
                  <TouchableOpacity
                    style={[S.pickerBtn, { borderColor: '#7f1d1d' }]}
                    onPress={() => {
                      if (avatarUri) {
                        setAvatarUri(null); // revert local pick
                      } else {
                        Alert.alert('Remove Photo', 'Remove your profile photo?', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove', style: 'destructive', onPress: async () => {
                              await updateUserProfile({ photoURL: '' });
                            }
                          },
                        ]);
                      }
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    <Text style={[S.pickerBtnText, { color: '#ef4444' }]}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* ── Name input ──────────────────────────────────────────── */}
            <View style={S.fieldSection}>
              <Text style={S.fieldLabel}>Display Name</Text>
              <View style={S.fieldWrap}>
                <Ionicons name="person-outline" size={17} color="#4b5563" style={{ marginRight: 10 }} />
                <TextInput
                  style={S.fieldInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your display name"
                  placeholderTextColor="#374151"
                  autoCapitalize="words"
                  maxLength={32}
                />
              </View>

              <Text style={S.fieldLabel}>Email</Text>
              <View style={[S.fieldWrap, { opacity: 0.5 }]}>
                <Ionicons name="mail-outline" size={17} color="#4b5563" style={{ marginRight: 10 }} />
                <TextInput
                  style={S.fieldInput}
                  value={user?.email || ''}
                  editable={false}
                  placeholderTextColor="#374151"
                />
                <Ionicons name="lock-closed-outline" size={14} color="#4b5563" />
              </View>
              <Text style={S.fieldHint}>Email cannot be changed</Text>
            </View>

            {/* ── Error ───────────────────────────────────────────────── */}
            {!!error && (
              <View style={S.errRow}>
                <Ionicons name="alert-circle-outline" size={14} color="#f87171" />
                <Text style={S.errText}>{error}</Text>
              </View>
            )}

            {/* ── Save button ─────────────────────────────────────────── */}
            <TouchableOpacity style={S.saveWrap} onPress={handleSave} activeOpacity={0.88} disabled={saving}>
              <LinearGradient colors={['#7c3aed', '#5b21b6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.saveGrad}>
                {saving ? (
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={S.saveText}>{uploading ? 'Uploading photo…' : 'Saving…'}</Text>
                  </View>
                ) : (
                  <Text style={S.saveText}>Save Changes</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 16 },
  sheet: { width: '100%', maxWidth: 450, backgroundColor: '#0e0e0e', borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 24, paddingBottom: 30, maxHeight: '92%' },
  handle: { width: 40, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4, display: 'none' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
  avatarWrap: { width: 120, height: 120, borderRadius: 60, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(167,139,250,0.4)', marginBottom: 12 },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', backgroundColor: '#1e1b4b', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 46, fontWeight: '800' },
  avatarOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', alignItems: 'center', justifyContent: 'center' },
  avatarHint: { color: '#4b5563', fontSize: 12, textAlign: 'center', marginBottom: 16 },
  pickerBtns: { flexDirection: 'row', gap: 10 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: 'rgba(167,139,250,0.08)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)', borderRadius: 20 },
  pickerBtnText: { color: '#a78bfa', fontSize: 13, fontWeight: '600' },

  // Fields
  fieldSection: { marginBottom: 8 },
  fieldLabel: { color: '#6b7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 12 },
  fieldWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 13, paddingHorizontal: 14, height: 52 },
  fieldInput: { flex: 1, color: '#fff', fontSize: 15 },
  fieldHint: { color: '#374151', fontSize: 11, marginTop: 4, marginLeft: 2 },

  // Error
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 10, padding: 10, marginBottom: 12 },
  errText: { color: '#f87171', fontSize: 12.5, flex: 1, lineHeight: 17 },

  // Save
  saveWrap: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveGrad: { height: 54, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
});
