import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/store/authStore';
import { startAutoSync } from '@/services/sync';
import { OfflineBanner } from '@/components/OfflineBanner';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const hydrate = useAuth((s) => s.hydrate);
  const isLoading = useAuth((s) => s.isLoading);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    hydrate();
    const stop = startAutoSync();
    return stop;
  }, [hydrate]);

  useEffect(() => {
    if (!isLoading && !appReady) {
      setAppReady(true);
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading, appReady]);

  if (!appReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <OfflineBanner />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0b1220' },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="chat" options={{ headerShown: false }} />
        </Stack>
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
} 