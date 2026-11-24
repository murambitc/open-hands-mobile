import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PanicButton } from '@/components/PanicButton';
import { useAuth } from '@/store/authStore';
import { moodEmoji, moodCategory, MOOD_COLORS } from '@/constants/moods';
import * as db from '@/services/db';
import * as api from '@/services/api';
import { checkOnline } from '@/services/network';
import { flushPending } from '@/services/sync';

function deduplicateLogs(rows: db.LocalCheckin[]): db.LocalCheckin[] {
  const seenServerIds = new Set<number>();
  const seenFingerprints = new Set<string>();
  const result: db.LocalCheckin[] = [];

  for (const row of rows) {
    if (row.server_id != null && row.server_id > 0) {
      if (seenServerIds.has(row.server_id)) continue;
      seenServerIds.add(row.server_id);
    }

    const minuteKey = String(row.created_at || '').slice(0, 16);
    const fingerprint = `${(row.mood || '').trim().toLowerCase()}|${(row.comment || '').trim().toLowerCase()}|${minuteKey}`;
    if (seenFingerprints.has(fingerprint)) continue;

    seenFingerprints.add(fingerprint);
    result.push(row);
  }

  return result;
}

export default function MoodLogsScreen() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<db.LocalCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isPullToRefresh = false) => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    if (!isPullToRefresh) {
      setLoading(true);
    }

    // Show cached local logs immediately
    const local = await db.getAllCheckinsLocal(user.id);
    setLogs(deduplicateLogs(local));
    setLoading(false);

    if (checkOnline()) {
      try {
        await flushPending();
        const res = await api.fetchCheckins(1);
        const remoteItems = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        if (remoteItems.length > 0) {
          await db.mergeRemoteCheckins(user.id, remoteItems);
        }
        const updated = await db.getAllCheckinsLocal(user.id);
        setLogs(deduplicateLogs(updated));
      } catch {
        // Keep cached local logs on network or server error
      }
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>📒 Mood Logs</Text>
        <Text style={styles.subtitle}>{logs.length} total entries</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />
          }
          showsVerticalScrollIndicator={false}
        >
          {logs.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>🌱</Text>
              <Text style={styles.emptyText}>No mood logs yet.</Text>
              <Text style={[styles.emptyText, { fontSize: 12, marginTop: 6 }]}>
                Submit a check-in on your Dashboard to start.
              </Text>
            </View>
          ) : (
            logs.map((log, index) => {
              const cat = moodCategory(log.mood);
              const color = MOOD_COLORS[cat] || Colors.textMuted;
              const key = log.server_id ? `srv-${log.server_id}` : `loc-${log.id}-${index}`;
              return (
                <View key={key} style={styles.logCard}>
                  <View style={styles.logHeader}>
                    <View style={[styles.moodBadge, { backgroundColor: color + '30', borderColor: color + '60' }]}>
                      <Text style={styles.moodEmoji}>{moodEmoji(log.mood)}</Text>
                      <Text style={[styles.moodLabel, { color }]}>{log.mood}</Text>
                    </View>
                    <Text style={styles.logTime}>
                      {format(new Date(log.created_at), 'dd MMM, HH:mm')}
                    </Text>
                  </View>
                  <Text style={styles.logComment}>{log.comment}</Text>
                  {log.synced === 0 && <Text style={styles.pending}>⏳ Pending sync</Text>}
                </View>
              );
            })
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <PanicButton />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.md, paddingTop: 12, paddingBottom: 8 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  scrollContent: { paddingHorizontal: Spacing.md, paddingBottom: 120 },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyText: { color: Colors.textMuted, fontSize: 14, marginTop: 12, textAlign: 'center' },
  logCard: {
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: Radius.lg,
    padding: 14, marginBottom: 10,
  },
  logHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  moodBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.sm, borderWidth: 1,
  },
  moodEmoji: { fontSize: 14 },
  moodLabel: { fontSize: 12, fontWeight: '700' },
  logTime: { color: '#64748b', fontSize: 11 },
  logComment: { color: '#1e293b', fontSize: 13.5, lineHeight: 19 },
  pending: { color: '#f59e0b', fontSize: 11, marginTop: 6 },
});
