import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGlobalNotification } from '../api/firestore';
import { BlurView } from 'expo-blur';

const NOTIFICATION_DISMISSED_KEY_PREFIX = '@kaizoku_notification_dismissed_';

export default function GlobalNotificationPopup() {
  const [notification, setNotification] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    async function checkNotification() {
      try {
        const notif = await getGlobalNotification();
        if (!notif || !notif.active) {
          return; // No active notification
        }

        // If showOnce is true, check if we've already dismissed it
        if (notif.showOnce && notif.id) {
          const dismissedKey = `${NOTIFICATION_DISMISSED_KEY_PREFIX}${notif.id}`;
          const hasDismissed = await AsyncStorage.getItem(dismissedKey);
          if (hasDismissed === 'true') {
            return; // Already dismissed, don't show
          }
        }

        // Show the notification
        setNotification(notif);
        setVisible(true);
      } catch (error) {
        console.log('[GlobalNotificationPopup] Error:', error);
      }
    }

    checkNotification();
  }, []);

  const handleDismiss = async () => {
    setVisible(false);
    if (notification?.showOnce && notification?.id) {
      const dismissedKey = `${NOTIFICATION_DISMISSED_KEY_PREFIX}${notification.id}`;
      await AsyncStorage.setItem(dismissedKey, 'true');
    }
  };

  const handleAction = async () => {
    if (notification?.link) {
      try {
        await Linking.openURL(notification.link);
      } catch (err) {
        console.log('Error opening notification link', err);
      }
    }
    handleDismiss();
  };

  if (!visible || !notification) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.container}>
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        
        <View style={styles.contentContainer}>
          <Text style={styles.title}>{notification.title || 'Notification'}</Text>
          <Text style={styles.message}>{notification.message || ''}</Text>
          
          <View style={styles.buttonContainer}>
            {notification.link && notification.buttonText ? (
              <TouchableOpacity style={styles.actionButton} onPress={handleAction}>
                <Text style={styles.actionButtonText}>{notification.buttonText}</Text>
              </TouchableOpacity>
            ) : null}
            
            <TouchableOpacity 
              style={[styles.dismissButton, notification.link ? styles.dismissButtonSecondary : null]} 
              onPress={handleDismiss}
            >
              <Text style={styles.dismissButtonText}>
                {notification.link ? 'Dismiss' : 'Got it'}
              </Text>
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
    padding: 24,
  },
  contentContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontFamily: 'Shojumaru',
    color: '#fff',
    fontSize: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    color: '#ccc',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
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
    backgroundColor: '#333',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
  },
  dismissButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#444',
  },
  dismissButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
