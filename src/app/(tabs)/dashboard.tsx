import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import { requireOptionalNativeModule } from 'expo-modules-core';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/store/authStore';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { MoodSelector } from '@/components/MoodSelector';
import { PanicButton } from '@/components/PanicButton';
import { LogoutButton } from '@/components/LogoutButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { parseVoiceCommand, VoiceAction } from '@/services/voiceCommands';
import * as db from '@/services/db';
import * as api from '@/services/api';
import { checkOnline } from '@/services/network';

const hasNativeSpeechModule = Boolean(requireOptionalNativeModule('ExpoSpeechRecognition'));

let SpeechModule: any = null;
let useSpeechEventHook: ((eventName: string, listener: (event: any) => void) => void) | null =
  null;

if (hasNativeSpeechModule) {
  try {
    const speechPkg = require('expo-speech-recognition');
    SpeechModule = speechPkg?.ExpoSpeechRecognitionModule ?? null;
    useSpeechEventHook = speechPkg?.useSpeechRecognitionEvent ?? null;
  } catch {
    SpeechModule = null;
    useSpeechEventHook = null;
  }
}

function useSafeSpeechEvent(eventName: string, listener: (event: any) => void) {
  if (hasNativeSpeechModule && typeof useSpeechEventHook === 'function') {
    useSpeechEventHook(eventName, listener);
  }
}

interface DashboardStats {
  total: number;
  thisMonth: number;
  streak: number;
  risk: string;
}

function extractMoodString(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const candidate = value.label ?? value.name ?? value.value ?? value.mood ?? '';
    return String(candidate).trim();
  }
  return String(value).trim();
}

function normalizeCheckinComment(raw: string, mood: string): string {
  const trimmed = (raw || '').trim();
  return trimmed.length >= 3 ? trimmed : `${mood} check-in`;
}

function formatCheckinDate(rawDate: any, fallbackAgo?: string): string {
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) {
      return format(parsed, 'dd MMM yyyy, HH:mm');
    }
  }
  return fallbackAgo || '';
}

function deduplicateLocalCheckins(rows: db.LocalCheckin[]): db.LocalCheckin[] {
  const seenServerIds = new Set<number>();
  const seenFingerprints = new Set<string>();
  const unique: db.LocalCheckin[] = [];

  for (const row of rows) {
    if (row.server_id != null && row.server_id > 0) {
      if (seenServerIds.has(row.server_id)) continue;
      seenServerIds.add(row.server_id);
    }

    const minuteKey = String(row.created_at || '').slice(0, 16);
    const fingerprint = `${(row.mood || '').trim().toLowerCase()}|${(row.comment || '').trim().toLowerCase()}|${minuteKey}`;
    if (seenFingerprints.has(fingerprint)) continue;

    seenFingerprints.add(fingerprint);
    unique.push(row);
  }

  return unique;
}

function calculateLocalStreak(rows: db.LocalCheckin[]): number {
  const dateSet = new Set<string>();
  for (const row of rows) {
    const parsed = new Date(row.created_at);
    if (!Number.isNaN(parsed.getTime())) {
      dateSet.add(format(parsed, 'yyyy-MM-dd'));
    }
  }

  if (dateSet.size === 0) return 0;

  let streak = 0;
  let cursor = new Date();
  const todayKey = format(cursor, 'yyyy-MM-dd');

  if (!dateSet.has(todayKey)) {
    cursor = subDays(cursor, 1);
  }

  while (dateSet.has(format(cursor, 'yyyy-MM-dd'))) {
    streak++;
    cursor = subDays(cursor, 1);
  }

  return streak;
}

function computeLocalStats(rows: db.LocalCheckin[], fallbackRisk = 'low'): DashboardStats {
  const now = new Date();
  const thisMonth = rows.filter((c) => {
    const d = new Date(c.created_at);
    if (Number.isNaN(d.getTime())) return false;
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return {
    total: rows.length,
    thisMonth,
    streak: calculateLocalStreak(rows),
    risk: fallbackRisk || 'low',
  };
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [mood, setMood] = useState<string>('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    thisMonth: 0,
    streak: 0,
    risk: 'low',
  });
  const [recent, setRecent] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveVoiceText, setLiveVoiceText] = useState('');

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    const fallbackRisk = (user as any)?.risk_level || 'low';
    const rawLocal = await db.getAllCheckinsLocal(user.id);
    let uniqueLocal = deduplicateLocalCheckins(rawLocal);
    let localStats = computeLocalStats(uniqueLocal, fallbackRisk);

    setStats(localStats);
    setRecent(
      uniqueLocal.slice(0, 5).map((c) => ({
        id: c.id,
        mood: c.mood,
        comment: c.comment,
        created_at: c.created_at,
      })),
    );

    const online = await checkOnline();
    if (online) {
      try {
        const res = await api.fetchDashboard();
        const payload = res?.data;
        if (payload) {
          if (Array.isArray(payload.recent_checkins) && payload.recent_checkins.length > 0) {
            await db.mergeRemoteCheckins(user.id, payload.recent_checkins);
            const refreshedLocal = await db.getAllCheckinsLocal(user.id);
            uniqueLocal = deduplicateLocalCheckins(refreshedLocal);
            localStats = computeLocalStats(uniqueLocal, payload.stats?.risk_level ?? fallbackRisk);
            setRecent(payload.recent_checkins.slice(0, 5));
          }

          const apiStats = payload.stats ?? {};
          setStats({
            total:
              typeof apiStats.total_checkins === 'number'
                ? Math.max(apiStats.total_checkins, uniqueLocal.length)
                : localStats.total,
            thisMonth:
              typeof apiStats.month_checkins === 'number'
                ? Math.max(apiStats.month_checkins, localStats.thisMonth)
                : localStats.thisMonth,
            streak:
              typeof apiStats.streak === 'number'
                ? apiStats.streak
                : localStats.streak,
            risk: apiStats.risk_level ?? localStats.risk,
          });
        }
      } catch {}
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      try {
        SpeechModule?.stop?.();
      } catch {}
    };
  }, []);

  function handleSelectMood(selectedMood: any) {
    const normalized = extractMoodString(selectedMood);
    setMood(normalized);
  }

  async function submitCheckin(overrideMood?: string, overrideComment?: string) {
    const cleanMood = extractMoodString(overrideMood ?? mood);
    if (!cleanMood) {
      return Toast.show({ type: 'error', text1: 'Please select a mood first' });
    }
    if (!user?.id) {
      return Toast.show({ type: 'error', text1: 'Please sign in again to save' });
    }

    const safeComment = normalizeCheckinComment(overrideComment ?? comment, cleanMood);

    setSaving(true);
    try {
      const localId = await db.saveCheckinLocal(user.id, cleanMood, safeComment);
      let isOfflineSave = true;

      const online = await checkOnline();
      if (online) {
        try {
          const res = await api.pushCheckin(cleanMood, safeComment);
          const serverId = Number(res?.data?.id ?? res?.id ?? res?.checkin?.id ?? 0);
          await db.markCheckinSynced(localId, serverId);
          isOfflineSave = false;
        } catch {
          isOfflineSave = true;
        }
      }

      setSavedOffline(isOfflineSave);
      setSuccessModal(true);
      setMood('');
      setComment('');
      await loadData();
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to save check-in',
        text2: e?.message || 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  function handleVoiceAction(action: VoiceAction) {
    if (action.type === 'navigate') {
      router.push(action.route);
      return;
    }

    if (action.type === 'mood') {
      setMood(action.mood);
      if (action.comment) {
        setComment(action.comment);
      }
      Toast.show({
        type: 'success',
        text1: `Mood set to ${action.mood}`,
        text2: 'Tap Submit Check-in or review your note.',
      });
      return;
    }

    if (action.type === 'chat' && action.prompt) {
      router.push({
        pathname: '/chat',
        params: { initialPrompt: action.prompt },
      });
    }
  }

  useSafeSpeechEvent('start', () => {
    setListening(true);
    setLiveVoiceText('');
  });

  useSafeSpeechEvent('end', () => {
    setListening(false);
  });

  useSafeSpeechEvent('result', (event: any) => {
    const transcript = String(event?.results?.[0]?.transcript ?? '').trim();
    const isFinal = Boolean(event?.isFinal);

    if (transcript) {
      setLiveVoiceText(transcript);
    }

    if (isFinal && transcript) {
      setLiveVoiceText('');
      handleVoiceAction(parseVoiceCommand(transcript));
    }
  });

  useSafeSpeechEvent('error', (event: any) => {
    setListening(false);
    setLiveVoiceText('');
    const code = event?.error || event?.code || 'unknown';
    if (code !== 'no-speech' && code !== 'aborted') {
      Toast.show({
        type: 'error',
        text1: 'Microphone error',
        text2: String(event?.message || code),
      });
    }
  });

  async function toggleVoiceCommand() {
    if (listening) {
      try {
        SpeechModule?.stop?.();
      } catch {}
      setListening(false);
      return;
    }

    if (!hasNativeSpeechModule || !SpeechModule) {
      Toast.show({
        type: 'info',
        text1: 'Voice commands require a native build',
        text2: 'Use a development or production build with speech recognition enabled.',
      });
      return;
    }

    try {
      const available =
        typeof SpeechModule.isRecognitionAvailable === 'function'
          ? SpeechModule.isRecognitionAvailable()
          : true;

      if (!available) {
        Toast.show({
          type: 'error',
          text1: 'Voice recognition unavailable',
          text2: 'Check device speech recognition settings.',
        });
        return;
      }

      const permission =
        typeof SpeechModule.requestPermissionsAsync === 'function'
          ? await SpeechModule.requestPermissionsAsync()
          : { granted: true };

      if (!permission?.granted) {
        Toast.show({
          type: 'error',
          text1: 'Microphone permission required',
          text2: 'Allow microphone & speech permissions in device settings.',
        });
        return;
      }

      Keyboard.dismiss();
      setLiveVoiceText('');
      SpeechModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
      });
    } catch (err: any) {
      setListening(false);
      Toast.show({
        type: 'error',
        text1: 'Microphone error',
        text2: String(err?.message || 'Unable to start voice command'),
      });
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  return (
    <>
      <ScreenContainer>
        <View style={styles.header}>
          <Text style={styles.title}>Dashboard</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.iconBtn, listening && styles.iconBtnActive]}
              onPress={toggleVoiceCommand}
              accessibilityLabel={listening ? 'Stop voice command' : 'Start voice command'}
            >
              <Ionicons name={listening ? 'stop' : 'mic'} size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/chat')}
              accessibilityLabel="Open Chat"
            >
              <Ionicons name="chatbubbles" size={18} color="#fff" />
            </TouchableOpacity>
            <LogoutButton />
          </View>
        </View>

        {listening && (
          <View style={styles.voiceBanner}>
            <Ionicons name="mic" size={14} color={Colors.accentLight} />
            <Text style={styles.voiceBannerText} numberOfLines={2}>
              {liveVoiceText
                ? `Heard: “${liveVoiceText}”`
                : 'Listening for command (e.g., “Open sessions”, “I feel calm”, or ask AI)...'}
            </Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
          }
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.greeting}>
            👋 Hello <Text style={{ color: '#ff4d8d' }}>{user?.username}</Text>
          </Text>

          <View style={styles.statsRow}>
            {[
              { label: 'Check-ins', value: stats.total, color: '#3b82f6' },
              { label: 'This Month', value: stats.thisMonth, color: '#22c55e' },
              { label: 'Streak', value: stats.streak, color: '#f59e0b' },
              { label: 'Risk', value: stats.risk, color: '#a855f7' },
            ].map((s) => (
              <View key={s.label} style={styles.statCard}>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>How are you feeling today?</Text>
            <MoodSelector selected={mood || null} onSelect={handleSelectMood} />
            <TextInput
              style={styles.textarea}
              value={comment}
              onChangeText={setComment}
              placeholder="Write your thoughts (optional)..."
              placeholderTextColor="#64748b"
              multiline
            />
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => submitCheckin()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.btnText}>Submit Check-in</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {recent.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recent Check-ins</Text>
              {recent.map((c, i) => {
                const dateLabel = formatCheckinDate(c.created_at, c.ago);
                return (
                  <View key={c.id ?? i} style={styles.checkinRow}>
                    <Text style={{ fontSize: 22 }}>{String(c.mood).split(' ')[0]}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.checkinTopRow}>
                        <Text style={styles.checkinMood}>{c.mood}</Text>
                        {!!dateLabel && (
                          <Text style={styles.checkinDate}>{dateLabel}</Text>
                        )}
                      </View>
                      <Text style={styles.checkinComment} numberOfLines={2}>
                        {c.comment}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        <PanicButton />
      </ScreenContainer>

      <Modal visible={successModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={{ fontSize: 40, textAlign: 'center' }}>✅</Text>
            <Text style={styles.modalTitle}>Check-in Saved</Text>
            <Text style={styles.modalBody}>
              {savedOffline
                ? 'Your mood has been saved offline and will sync automatically when connected.'
                : 'Your mood has been recorded and synced.'}
            </Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setSuccessModal(false)}>
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accentLight,
  },
  voiceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(190, 24, 93, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 141, 0.35)',
  },
  voiceBannerText: {
    flex: 1,
    color: '#fbcfe8',
    fontSize: 12,
    fontWeight: '500',
  },
  scrollContent: { paddingHorizontal: Spacing.md, paddingBottom: 120 },
  greeting: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: Spacing.md },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: Colors.glass,
    borderRadius: Radius.md,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { color: Colors.textMuted, fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
  card: {
    backgroundColor: Colors.glass,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    marginBottom: Spacing.md,
  },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: Spacing.md },
  textarea: {
    backgroundColor: '#0f172a',
    color: '#fff',
    borderRadius: Radius.md,
    padding: 12,
    minHeight: 90,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#253a5c',
    marginTop: Spacing.sm,
  },
  btnPrimary: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing.md,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  checkinRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  checkinTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  checkinMood: { color: '#fff', fontSize: 13, fontWeight: '600' },
  checkinDate: { color: Colors.textMuted, fontSize: 11 },
  checkinComment: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#1b2a47',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginVertical: 10 },
  modalBody: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: Spacing.md },
});
