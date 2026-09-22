import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Linking, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import Markdown from 'react-native-markdown-display';
import packageJson from '../../package.json';

const UPDATE_DISMISSED_KEY_PREFIX = '@kaizoku_update_dismissed_';
const GITHUB_REPO = 'Yaboku77/kaizoku';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

// Helper to compare semver versions (e.g. 1.0.1 > 1.0.0)
const isNewerVersion = (latest, current) => {
  const parse = (v) => v.replace(/^v/, '').split('.').map(Number);
  const [lMajor, lMinor, lPatch] = parse(latest);
  const [cMajor, cMinor, cPatch] = parse(current);

  if (lMajor > cMajor) return true;
  if (lMajor === cMajor && lMinor > cMinor) return true;
  if (lMajor === cMajor && lMinor === cMinor && lPatch > cPatch) return true;
  return false;
};

export default function AppUpdatePopup() {
  const [releaseInfo, setReleaseInfo] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    async function checkForUpdate() {
      try {
        const response = await fetch(GITHUB_API_URL);
        if (!response.ok) return;

        const data = await response.json();
        const latestVersion = data.tag_name;
        const currentVersion = packageJson.version;

        if (latestVersion && isNewerVersion(latestVersion, currentVersion)) {
          // Check if this specific version update was already dismissed
          const dismissedKey = `${UPDATE_DISMISSED_KEY_PREFIX}${latestVersion}`;
          const hasDismissed = await AsyncStorage.getItem(dismissedKey);
          if (hasDismissed === 'true') {
            return; // User already dismissed this update
          }

          setReleaseInfo(data);
          setVisible(true);
        }
      } catch (error) {
        console.log('[AppUpdatePopup] Error checking for updates:', error);
      }
    }

    checkForUpdate();
  }, []);

  const handleDismiss = async () => {
    setVisible(false);
    if (releaseInfo?.tag_name) {
      const dismissedKey = `${UPDATE_DISMISSED_KEY_PREFIX}${releaseInfo.tag_name}`;
      await AsyncStorage.setItem(dismissedKey, 'true');
    }
  };

  const handleUpdate = async () => {
    if (releaseInfo?.html_url) {
      try {
        await Linking.openURL(releaseInfo.html_url);
      } catch (err) {
        console.log('Error opening github release url', err);
      }
    }
  };

  if (!visible || !releaseInfo) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <View style={styles.container}>
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        
        <View style={styles.contentContainer}>
          <Text style={styles.title}>Update Available!</Text>
          <Text style={styles.versionText}>
            Version {releaseInfo.tag_name} is now available (Current: v{packageJson.version})
          </Text>
          
          <ScrollView style={styles.markdownContainer} indicatorStyle="white">
            <Markdown style={markdownStyles}>
              {releaseInfo.body || 'No release notes provided.'}
            </Markdown>
          </ScrollView>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.actionButton} onPress={handleUpdate}>
              <Text style={styles.actionButtonText}>Update Now</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
              <Text style={styles.dismissButtonText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  contentContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontFamily: 'Shojumaru',
    color: '#E50914',
    fontSize: 22,
    marginBottom: 8,
    textAlign: 'center',
  },
  versionText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  markdownContainer: {
    flexShrink: 1,
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  actionButton: {
    backgroundColor: '#E50914',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dismissButton: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#444',
  },
  dismissButtonText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
  },
});

const markdownStyles = {
  body: {
    color: '#eee',
    fontSize: 15,
    lineHeight: 22,
  },
  heading1: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 10,
  },
  heading2: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 10,
  },
  heading3: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 10,
  },
  link: {
    color: '#3b82f6',
    textDecorationLine: 'none',
  },
  list_item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  bullet_list: {
    marginBottom: 10,
  },
  ordered_list: {
    marginBottom: 10,
  },
  strong: {
    fontWeight: 'bold',
  },
  em: {
    fontStyle: 'italic',
  },
  hr: {
    backgroundColor: '#333',
    height: 1,
    marginVertical: 12,
  },
  code_inline: {
    backgroundColor: '#222',
    color: '#ffb86c',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: 'monospace',
  },
  code_block: {
    backgroundColor: '#222',
    color: '#eee',
    padding: 10,
    borderRadius: 8,
    fontFamily: 'monospace',
    marginBottom: 10,
  },
  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: '#E50914',
    paddingLeft: 10,
    marginLeft: 0,
    opacity: 0.8,
  }
};
