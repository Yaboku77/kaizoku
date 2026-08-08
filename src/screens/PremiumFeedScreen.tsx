import React, { useEffect } from 'react';
import { View, FlatList, StyleSheet, SafeAreaView, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import SharedCard from '../components/SharedCard';
import { springConfig } from '../components/Transitions';

const dummyData = [
  {
    id: '1',
    title: 'Premium Shared Element',
    subtitle: 'Smooth 60FPS Transitions',
    image: 'https://picsum.photos/400/300?random=1',
  },
  {
    id: '2',
    title: 'React Native Reanimated v3',
    subtitle: 'Spring Physics',
    image: 'https://picsum.photos/400/300?random=2',
  },
  {
    id: '3',
    title: 'Native Stack Navigator',
    subtitle: 'Transparent Modal',
    image: 'https://picsum.photos/400/300?random=3',
  },
];

export default function PremiumFeedScreen({ navigation }: any) {
  const isFocused = useIsFocused();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (isFocused) {
      scale.value = withSpring(1, springConfig);
      opacity.value = withSpring(1, springConfig);
    } else {
      scale.value = withSpring(0.95, springConfig); // Slightly deeper scale for emphasis
      opacity.value = withSpring(0.6, springConfig);
    }
  }, [isFocused, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.innerContainer, animatedStyle]}>
        <Text style={styles.headerTitle}>Premium Feed</Text>
        <FlatList
          data={dummyData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <SharedCard
              item={item}
              onPress={() => navigation.navigate('PremiumDetail', { item })}
            />
          )}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  innerContainer: {
    flex: 1,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  }
});
