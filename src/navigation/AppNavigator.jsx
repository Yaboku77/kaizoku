import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { COLORS } from '../data/constants';

import HomeScreen from '../screens/HomeScreen';
import BrowseScreen from '../screens/BrowseScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import MyListScreen from '../screens/MyListScreen';
import YouScreen from '../screens/YouScreen';
import DetailsScreen from '../screens/DetailsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SearchScreen from '../screens/SearchScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import HistoryScreen from '../screens/HistoryScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'rgba(5,5,5,0.7)',
          borderTopWidth: 1,
          borderTopColor: '#1a1a1a',
          elevation: 0,
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarBackground: () => (
          <BlurView tint="dark" intensity={60} style={{ flex: 1, backgroundColor: 'rgba(5,5,5,0.85)' }} />
        ),
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarIcon: ({ focused, color }) => {
          const icons = {
            Home:     focused ? 'home'     : 'home-outline',
            Schedule: focused ? 'calendar' : 'calendar-outline',
            Browse:   focused ? 'grid'     : 'grid-outline',
            'My List': focused ? 'library' : 'library-outline',
            You:      focused ? 'person'   : 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={focused ? 24 : 22} color={color} style={focused ? { transform: [{ scale: 1.1 }] } : undefined} />;
        },
      })}
    >
      <Tab.Screen name="Home"     component={HomeScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
      <Tab.Screen name="Browse"   component={BrowseScreen} />
      <Tab.Screen name="My List"  component={MyListScreen} />
      <Tab.Screen name="You"      component={YouScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: COLORS.bg },
        }}
      >
        {/* Auth is now a Modal popup — no dedicated Auth screen needed */}
        <Stack.Screen name="Tabs"          component={BottomTabs} />
        <Stack.Screen name="Details"       component={DetailsScreen} />
        <Stack.Screen name="BrowseStack"   component={BrowseScreen} />
        <Stack.Screen name="Settings"      component={SettingsScreen} />
        <Stack.Screen name="Search"        component={SearchScreen}        options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="History"       component={HistoryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
