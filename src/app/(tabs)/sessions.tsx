import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PanicButton } from '@/components/PanicButton';
import * as db from '@/services/db';
import * as api from '@/services/api';
import { checkOnline } from '@/services/network';

function extractSessionsList(res: any): any[] | null {
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.sessions)) return res.sessions;
  if (Array.isArray(res)) return res;
  return null;
}

export default function SessionsScreen() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);

    try {
      const cached = await db.getCachedSessions();
      if (Array.isArray(cached)) {
        setSessions(cached);
      }
    } catch (e) {
      console.warn('getCachedSessions failed:', e);
    }

    setLoading(false);

    const online = await checkOnline();
    if (online && typeof (api as any).fetchSessions === 'function') {
      try {
        const res = await (api as any).fetchSessions({ per_page: 100 });
        const remoteList = extractSessionsList(res);
        if (remoteList) {
          await db.cacheSessions(remoteList);
          const refreshedCache =
            typeof (db as any).getCachedSessions === 'function'
              ? await (db as any).getCachedSessions()
              : remoteList;
          setSessions(Array.isArray(refreshedCache) ? refreshedCache : remoteList);
        }
      } catch (e) {
        console.warn('fetchSessions failed:', e);
      }
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        load(false);
      }
    });
    return () => sub.remove();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>📢 Sessions</Text>
        <Text style={styles.subtitle}>Upcoming wellness events</Text>
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
          {sessions.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>📅</Text>
              <Text style={styles.emptyText}>No sessions posted yet.</Text>
            </View>
          ) : (
            sessions.map((s, idx) => (
              <View key={s?.id ?? `session-${idx}`} style={styles.card}>
                {s.image_url && (
                  <Image source={{ uri: s.image_url }} style={styles.image} />
                )}
                <View style={{ padding: Spacing.md }}>
                  <Text style={styles.sessionTitle}>{s.title}</Text>
                  <Text style={styles.sessionDesc} numberOfLines={3}>
                    {s.description}
                  </Text>

                  <View style={styles.metaRow}>
                    <Ionicons name="calendar" size={14} color={Colors.accentLight} />
                    <Text style={styles.metaText}>{s.session_date || '—'}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="time" size={14} color={Colors.accentLight} />
                    <Text style={styles.metaText}>{s.session_time || '—'}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="location" size={14} color={Colors.accentLight} />
                    <Text style={styles.metaText}>{s.location || '—'}</Text>
                  </View>
                </View>
              </View>
            ))
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
  emptyText: { color: Colors.textMuted, fontSize: 14, marginTop: 12 },
  card: {
    backgroundColor: Colors.glass,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  image: { width: '100%', height: 160 },
  sessionTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  sessionDesc: { color: Colors.text, fontSize: 13, marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  metaText: { color: Colors.textMuted, fontSize: 12 },
});