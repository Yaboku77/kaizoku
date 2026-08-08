import { SharedTransition, withSpring } from 'react-native-reanimated';

export const springConfig = {
  damping: 20,
  stiffness: 200,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
};

export const customSharedTransition = SharedTransition.custom((values) => {
  'worklet';
  return {
    height: withSpring(values.targetHeight, springConfig),
    width: withSpring(values.targetWidth, springConfig),
    originX: withSpring(values.targetOriginX, springConfig),
    originY: withSpring(values.targetOriginY, springConfig),
  };
});
