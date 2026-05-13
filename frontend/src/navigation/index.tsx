import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '../store/useUserStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { Colors } from '../constants/theme';

import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import OnboardingPhotoScreen from '../screens/OnboardingPhotoScreen';
import AboutScreen from '../screens/AboutScreen';
import HomeScreen from '../screens/HomeScreen';
import TryOnScreen from '../screens/TryOnScreen';
import ProfileScreen from '../screens/ProfileScreen';
import FriendsScreen from '../screens/FriendsScreen';
import InboxScreen from '../screens/InboxScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import AdminConsoleScreen from '../screens/AdminConsoleScreen';
import PurchaseScreen from '../screens/PurchaseScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';
import BlockedUsersScreen from '../screens/BlockedUsersScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import TryOnCommentsScreen from '../screens/TryOnCommentsScreen';

export type AuthStackParams = {
  Login: undefined;
  Signup: undefined;
  OnboardingPhoto: undefined;
  // About is reachable pre-signup so prospective users can see the value
  // proposition, tier features, and live StoreKit pricing before being asked
  // to register. Required for App Store Guideline 5.1.1(v) compliance.
  About: undefined;
};

export type MainTabParams = {
  Home: undefined;
  Friends: { initialTab?: 'following' | 'followers'; openSearch?: boolean } | undefined;
  TryOn: undefined;
  Inbox: undefined;
  Profile: undefined;
};

export type RootStackParams = {
  Auth: undefined;
  Main: undefined;
  Settings: undefined;
  EditProfile: undefined;
  AdminConsole: undefined;
  Purchase: undefined;
  Friends: { initialTab?: 'following' | 'followers'; openSearch?: boolean };
  PublicProfile: { username: string };
  BlockedUsers: undefined;
  ChangePassword: undefined;
  // Optional commentId is used by inbox notifications (COMMENT_REPLY,
  // COMMENT_LIKE) to deep-link into the thread and auto-scroll/highlight a
  // specific comment after the screen loads.
  TryOnComments: { jobId: string; commentId?: string };
};

const Stack = createNativeStackNavigator<RootStackParams>();
const AuthStack = createNativeStackNavigator<AuthStackParams>();
const Tab = createBottomTabNavigator<MainTabParams>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="OnboardingPhoto" component={OnboardingPhotoScreen} />
      <AuthStack.Screen name="About" component={AboutScreen} />
    </AuthStack.Navigator>
  );
}

function CameraTabIcon({ focused }: { focused: boolean }) {
  return (
    <View
      style={{
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: Colors.black,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
      }}
    >
      <Text
        style={{
          color: focused ? '#ccc' : Colors.white,
          fontSize: 13,
          fontWeight: '800',
          letterSpacing: 0.5,
        }}
      >
        TryOn
      </Text>
    </View>
  );
}

function MainTabs() {
  const { unreadCount, fetchUnreadCount } = useNotificationStore();

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: Colors.black,
        tabBarInactiveTintColor: Colors.gray400,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.gray200,
          height: 70,
          paddingBottom: 10,
        },
        tabBarLabelStyle: { fontSize: 10 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="TryOn"
        component={TryOnScreen}
        options={{
          tabBarLabel: '',
          tabBarIcon: ({ focused }) => <CameraTabIcon focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mail-outline" size={size} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.black, color: Colors.white, fontSize: 10 },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, isInitialized, initialize } = useUserStore();

  useEffect(() => {
    initialize();
  }, []);

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color={Colors.black} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ presentation: 'modal', headerShown: true, title: 'Settings' }}
            />
            <Stack.Screen
              name="EditProfile"
              component={EditProfileScreen}
              options={{ presentation: 'modal', headerShown: true, title: 'Edit Profile' }}
            />
            {/* AdminConsole is only registered for users in the ADMIN_EMAILS allowlist
                or in dev builds. Defense in depth on top of the Settings UI gate, so
                a malicious deep-link cannot reach the screen on a normal user's device. */}
            {(__DEV__ || user.isAdmin) ? (
              <Stack.Screen
                name="AdminConsole"
                component={AdminConsoleScreen}
                options={{ presentation: 'modal', headerShown: false }}
              />
            ) : null}
            <Stack.Screen
              name="Purchase"
              component={PurchaseScreen}
              options={{ presentation: 'modal', headerShown: false }}
            />
            <Stack.Screen
              name="PublicProfile"
              component={PublicProfileScreen}
              options={{ presentation: 'card', headerShown: false }}
            />
            <Stack.Screen
              name="BlockedUsers"
              component={BlockedUsersScreen}
              // Modal presentation so this screen stacks ABOVE the Settings modal
              // when launched from there. A 'card' presentation would push to the
              // parent stack and render underneath.
              options={{ presentation: 'modal', headerShown: false }}
            />
            <Stack.Screen
              name="ChangePassword"
              component={ChangePasswordScreen}
              // Modal so it stacks above Settings (where it's launched from).
              options={{ presentation: 'modal', headerShown: false }}
            />
            <Stack.Screen
              name="TryOnComments"
              component={TryOnCommentsScreen}
              // Card presentation: feels native to drill-into-detail from the
              // feed. Back swipe returns to Home.
              options={{ presentation: 'card', headerShown: false }}
            />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
