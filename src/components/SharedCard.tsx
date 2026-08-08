import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { customSharedTransition } from './Transitions';

interface SharedCardProps {
  item: {
    id: string;
    title: string;
    subtitle: string;
    image: string;
  };
  onPress: () => void;
}

export default function SharedCard({ item, onPress }: SharedCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.cardContainer}>
      <Animated.Image
        source={{ uri: item.image }}
        style={styles.image}
        sharedTransitionTag={`image-${item.id}`}
        sharedTransitionStyle={customSharedTransition}
      />
      <View style={styles.textContainer}>
        <Animated.Text
          style={styles.title}
          sharedTransitionTag={`title-${item.id}`}
          numberOfLines={2}
        >
          {item.title}
        </Animated.Text>
        <Animated.Text
          style={styles.subtitle}
          sharedTransitionTag={`subtitle-${item.id}`}
          numberOfLines={1}
        >
          {item.subtitle}
        </Animated.Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: 140,
    height: 100,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    // Need this for Android sometimes to enforce border radius on Animated.Image during transitions:
    // overflow: 'hidden'
  },
  textContainer: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    color: '#aaaaaa',
    fontSize: 14,
  },
});
