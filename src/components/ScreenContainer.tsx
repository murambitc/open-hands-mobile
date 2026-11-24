import React from 'react';
import { View, StyleSheet, StatusBar, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  /** Show the branded blue gradient background. Default: true */
  gradient?: boolean;
}

/**
 * ScreenContainer wraps every tab screen with:
 *  - Safe area handling at the top (status bar)
 *  - Safe area handling at the bottom (home indicator / gesture bar)
 *  - A branded gradient background
 *
 * The bottom safe area is applied INSIDE the container so that content sits
 * above the tab bar. The tab bar itself handles its own safe area, so we only
 * reserve the bare minimum here to avoid double padding.
 */
export function ScreenContainer({ children, gradient = true }: Props) {
  const insets = useSafeAreaInsets();

  const content = (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {children}
    </View>
  );

  if (!gradient) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        {content}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={[Colors.backgroundStart, Colors.backgroundEnd]}
        style={styles.gradient}
      >
        {content}
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gradient: {
    flex: 1,
  },
  wrapper: {
    flex: 1,
  },
});