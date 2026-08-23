import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withSpring
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';

export default function AnimatedTabWrapper({ children }) {
  const isFocused = useIsFocused();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const scale = useSharedValue(0.98);

  useEffect(() => {
    if (isFocused) {
      opacity.value = withTiming(1, {
        duration: 350,
        easing: Easing.out(Easing.cubic)
      });
      translateY.value = withSpring(0, {
        damping: 20,
        stiffness: 100
      });
      scale.value = withSpring(1, {
        damping: 20,
        stiffness: 100
      });
    } else {
      opacity.value = 0;
      translateY.value = 20;
      scale.value = 0.98;
    }
  }, [isFocused]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      flex: 1,
      opacity: opacity.value,
      transform: [
        { translateY: translateY.value },
        { scale: scale.value }
      ],
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      {children}
    </Animated.View>
  );
}
