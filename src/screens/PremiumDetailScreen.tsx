import React from 'react';
import { View, StyleSheet, Dimensions, Pressable, ScrollView } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { customSharedTransition } from '../components/Transitions';

const { width } = Dimensions.get('window');
const IMAGE_HEIGHT = width * (9 / 16); // 16:9 aspect ratio

export default function PremiumDetailScreen({ route, navigation }: any) {
  const { item } = route.params;

  return (
    <View style={styles.container}>
      {/* Background overlay that fades in. Since the presentation is transparentModal, 
          this provides the dark background behind the detail content while letting 
          the feed screen peek through at the very top/bottom if we wanted, 
          but here we make it solid to cover the scaled-down feed screen. */}
      <Animated.View
        entering={FadeIn.duration(400)}
        exiting={FadeOut.duration(400)}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000000' }]}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Animated.Image
          source={{ uri: item.image }}
          style={styles.heroImage}
          sharedTransitionTag={`image-${item.id}`}
          sharedTransitionStyle={customSharedTransition}
        />

        {/* Close Button / Swipe Down Hint */}
        <Pressable style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-down-circle" size={32} color="rgba(255,255,255,0.8)" />
        </Pressable>

        <View style={styles.contentContainer}>
          <Animated.Text
            style={styles.title}
            sharedTransitionTag={`title-${item.id}`}
          >
            {item.title}
          </Animated.Text>
          <Animated.Text
            style={styles.subtitle}
            sharedTransitionTag={`subtitle-${item.id}`}
          >
            {item.subtitle}
          </Animated.Text>

          {/* Staggered Content appearing below */}
          <Animated.View entering={FadeInDown.delay(200).duration(400).springify()}>
            <View style={styles.actionRow}>
              <Pressable style={styles.playButton}>
                <Ionicons name="play" size={20} color="#000" />
                <Animated.Text style={styles.playButtonText}>Play</Animated.Text>
              </Pressable>
              <Pressable style={styles.iconButton}>
                <Ionicons name="download-outline" size={24} color="#fff" />
              </Pressable>
              <Pressable style={styles.iconButton}>
                <Ionicons name="add-outline" size={24} color="#fff" />
              </Pressable>
            </View>
            <Animated.Text style={styles.description}>
              This is a beautiful premium shared element transition. The card image seamlessly resizes into the header, while the text glides into position. The underlying feed screen smoothly scales down, providing a sense of depth and spatial awareness.
            </Animated.Text>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroImage: {
    width: width,
    height: IMAGE_HEIGHT,
    // Setting border radius to 0 matches the end state of the transition
    borderRadius: 0,
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 16,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  contentContainer: {
    padding: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#aaaaaa',
    fontSize: 16,
    marginBottom: 24,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  playButton: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    marginRight: 16,
  },
  playButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  iconButton: {
    padding: 12,
  },
  description: {
    color: '#cccccc',
    fontSize: 16,
    lineHeight: 24,
  },
});
