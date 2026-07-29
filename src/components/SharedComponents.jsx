import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Dimensions, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../data/constants';

const { width } = Dimensions.get('window');

export function AnimeCard({ data, onPress, style }) {
  const title = data.title || data.name || 'Unknown';
  const image = data.image || data.coverImage?.extraLarge || data.coverImage?.large;

  const getStatusColor = (status) => {
    if (!status) return '#6b7280';
    const s = status.toUpperCase();
    if (s.includes('RELEASING') || s.includes('AIRING')) return '#22c55e';
    if (s.includes('NOT_YET') || s.includes('UPCOMING')) return '#eab308';
    return '#6b7280';
  };

  return (
    <TouchableOpacity onPress={onPress} style={[styles.card, style]} activeOpacity={0.7}>
      <View style={styles.imageContainer}>
        <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(data.status) }]} />
      </View>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      <Text style={styles.meta}>{data.type || data.format || 'TV'} {data.year || data.seasonYear || ''}</Text>
    </TouchableOpacity>
  );
}

export function SectionHeader({ title, showArrow = true, onPress }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {showArrow && (
        <TouchableOpacity onPress={onPress}>
          <Text style={styles.sectionArrow}>›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function LoadingSpinner() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}

export function SkeletonCard() {
  return <AnimatedShimmer style={styles.skeletonCard} />;
}

export function SkeletonRect({ width: w, height: h, style }) {
  return <AnimatedShimmer style={[{ width: w, height: h, borderRadius: 8 }, style]} />;
}

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

export function AnimatedShimmer({ style }) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [animatedValue]);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  return (
    <View style={[styles.shimmerContainer, style]}>
      <AnimatedGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 110,
    marginRight: 12,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 3/4.2,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
    marginBottom: 6,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  statusDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  title: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginBottom: 2,
  },
  meta: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionArrow: {
    color: COLORS.textMuted,
    fontSize: 22,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  skeletonCard: {
    width: 110,
    aspectRatio: 3/4.2,
    borderRadius: 12,
    backgroundColor: '#111',
    marginRight: 12,
    overflow: 'hidden',
  },
  shimmerContainer: {
    backgroundColor: '#111',
    overflow: 'hidden',
  },
});
