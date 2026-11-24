import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { subscribeNetwork } from '@/services/network';
import { subscribeSync } from '@/services/sync';
import { Colors, Spacing } from '@/constants/theme';

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const un1 = subscribeNetwork(setOnline);
    const un2 = subscribeSync((s) => {
      setPending(s.pendingCount);
      setSyncing(s.isSyncing);
    });
    return () => { un1(); un2(); };
  }, []);

  if (online && pending === 0) return null;

  return (
    <View style={[styles.banner, !online && styles.offline]}>
      <Ionicons
        name={!online ? 'cloud-offline' : syncing ? 'sync' : 'cloud-upload'}
        size={16}
        color="#fff"
      />
      <Text style={styles.text}>
        {!online
          ? 'Offline — changes will sync when online'
          : syncing
          ? `Syncing ${pending} item${pending > 1 ? 's' : ''}...`
          : `${pending} item${pending > 1 ? 's' : ''} pending sync`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warning,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  offline: { backgroundColor: Colors.danger },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
});