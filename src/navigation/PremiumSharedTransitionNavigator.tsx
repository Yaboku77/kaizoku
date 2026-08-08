import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PremiumFeedScreen from '../screens/PremiumFeedScreen';
import PremiumDetailScreen from '../screens/PremiumDetailScreen';

const Stack = createNativeStackNavigator();

export default function PremiumSharedTransitionNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen 
        name="PremiumFeed" 
        component={PremiumFeedScreen} 
      />
      <Stack.Screen 
        name="PremiumDetail" 
        component={PremiumDetailScreen} 
        options={{
          // Use transparentModal so the Feed screen remains visible underneath
          // and we can scale it down smoothly.
          presentation: 'transparentModal',
          // Use fade animation to enter the screen, Reanimated will handle the shared elements
          animation: 'fade',
        }}
      />
    </Stack.Navigator>
  );
}
