
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60 + Math.max(insets.bottom, 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(11,18,32,0.98)',
          borderTopColor: Colors.glassBorder,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 6,
          elevation: 0,
        },
        tabBarActiveTintColor: Colors.accentLight,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="screening"
        options={{
          title: 'Screening',
          tabBarIcon: ({ color }) => <Ionicons name="clipboard" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="mood-logs"
        options={{
          title: 'Logs',
          tabBarIcon: ({ color }) => <Ionicons name="journal" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tracker"
        options={{
          title: 'Tracker',
          tabBarIcon: ({ color }) => <Ionicons name="trending-up" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="organizations"
        options={{
          title: 'Directory',
          tabBarIcon: ({ color }) => <Ionicons name="people" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="wellness-tools"
        options={{
          title: 'Tools',
          tabBarIcon: ({ color }) => <Ionicons name="heart" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color }) => <Ionicons name="calendar" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
