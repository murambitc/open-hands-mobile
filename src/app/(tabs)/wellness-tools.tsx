import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';
import Toast from 'react-native-toast-message';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { format } from 'date-fns';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PanicButton } from '@/components/PanicButton';
import { parseVoiceCommand, VoiceAction } from '@/services/voiceCommands';

const JOURNAL_KEY = 'oh_journal';
const HABITS_KEY = 'oh_habits';
const BREATHING_LOG_KEY = 'oh_breathing_logs';
const MEDITATION_LOG_KEY = 'oh_meditation_logs';

type TabKey = 'breathing' | 'journal' | 'meditation' | 'habits';

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

function formatDateTime(isoOrDate?: string | Date | null): string {
  if (!isoOrDate) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return format(d, 'dd MMM yyyy, HH:mm');
}

export default function WellnessToolsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('breathing');
  const [listening, setListening] = useState(false);
  const [liveVoiceText, setLiveVoiceText] = useState('');

  useEffect(() => {
    return () => {
      try {
        SpeechModule?.stop?.();
      } catch {}
    };
  }, []);

  function applyVoiceAction(action: VoiceAction, rawTranscript: string) {
    const lower = rawTranscript.toLowerCase();

    if (lower.includes('breathe') || lower.includes('breathing')) {
      setTab('breathing');
      return;
    }
    if (lower.includes('journal') || lower.includes('write entry')) {
      setTab('journal');
      return;
    }
    if (lower.includes('meditat') || lower.includes('timer')) {
      setTab('meditation');
      return;
    }
    if (lower.includes('habit')) {
      setTab('habits');
      return;
    }

    if (action.type === 'navigate') {
      router.push(action.route);
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
      applyVoiceAction(parseVoiceCommand(transcript), transcript);
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

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🧠 Wellness Tools</Text>
          <Text style={styles.subtitle}>Small practices. Big difference.</Text>
        </View>
        <TouchableOpacity
          style={[styles.micHeaderBtn, listening && styles.micHeaderBtnActive]}
          onPress={toggleVoiceCommand}
          accessibilityLabel={listening ? 'Stop voice command' : 'Start voice command'}
        >
          <Ionicons name={listening ? 'stop' : 'mic'} size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {listening && (
        <View style={styles.voiceBanner}>
          <Ionicons name="mic" size={14} color={Colors.accentLight} />
          <Text style={styles.voiceBannerText} numberOfLines={2}>
            {liveVoiceText
              ? `Heard: “${liveVoiceText}”`
              : 'Listening... Say “Meditate”, “Breathe”, “Journal”, or “Habits”'}
          </Text>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {[
          { key: 'breathing', label: 'Breathe', icon: 'leaf' },
          { key: 'journal', label: 'Journal', icon: 'book' },
          { key: 'meditation', label: 'Meditate', icon: 'timer' },
          { key: 'habits', label: 'Habits', icon: 'checkmark-circle' },
        ].map((t) => {
          const isActive = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key as TabKey)}
              style={[styles.tab, isActive && styles.tabActive]}
              activeOpacity={0.8}
            >
              <Ionicons
                name={t.icon as any}
                size={16}
                color={isActive ? '#fff' : Colors.textMuted}
              />
              <Text
                style={[styles.tabText, isActive && styles.tabTextActive]}
                numberOfLines={1}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'breathing' && <BreathingTool />}
        {tab === 'journal' && <JournalTool />}
        {tab === 'meditation' && <MeditationTool />}
        {tab === 'habits' && <HabitsTool />}
        <View style={{ height: 100 }} />
      </ScrollView>

      <PanicButton />
    </ScreenContainer>
  );
}

/* ================================================================
   BREATHING TOOL
   ================================================================ */
function BreathingTool() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'Inhale' | 'Hold' | 'Exhale'>('Inhale');
  const [scale, setScale] = useState(1);
  const [logs, setLogs] = useState<any[]>([]);
  const logsRef = useRef<any[]>([]);
  const timeoutRef = useRef<any>(null);
  const startedAtRef = useRef<number | null>(null);

  const loadBreathingLogs = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(BREATHING_LOG_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      logsRef.current = list;
      setLogs(list);
    } catch {}
  }, []);

  useEffect(() => {
    loadBreathingLogs();
  }, [loadBreathingLogs]);

  useEffect(() => {
    if (!running) return;

    let idx = 0;
    const phases: ('Inhale' | 'Hold' | 'Exhale')[] = ['Inhale', 'Hold', 'Exhale'];
    const scales = [1.5, 1.5, 1];
    setPhase(phases[0]);
    setScale(scales[0]);

    const next = () => {
      idx = (idx + 1) % 3;
      setPhase(phases[idx]);
      setScale(scales[idx]);
      timeoutRef.current = setTimeout(next, 4000);
    };
    timeoutRef.current = setTimeout(next, 4000);

    return () => clearTimeout(timeoutRef.current);
  }, [running]);

  async function recordSession(durationSec: number) {
    const nowIso = new Date().toISOString();
    const safeSec = Math.max(1, Math.round(durationSec));
    const item = {
      id: `breath-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      durationSec: safeSec,
      completedAt: nowIso,
    };
    const updated = [item, ...logsRef.current].slice(0, 20);
    logsRef.current = updated;
    setLogs(updated);
    try {
      await AsyncStorage.setItem(BREATHING_LOG_KEY, JSON.stringify(updated));
    } catch {}
  }

  async function toggle() {
    if (!running) {
      startedAtRef.current = Date.now();
      setRunning(true);
    } else {
      setRunning(false);
      setPhase('Inhale');
      setScale(1);
      const elapsedSec = startedAtRef.current
        ? (Date.now() - startedAtRef.current) / 1000
        : 4;
      startedAtRef.current = null;
      await recordSession(elapsedSec);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>🧘 Breathing Exercise</Text>
      <View style={styles.stage}>
        <View style={[styles.breathCircle, { transform: [{ scale: running ? scale : 1 }] }]}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
            {running ? phase : 'Ready?'}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.btnPrimary} onPress={toggle}>
        <Ionicons name={running ? 'stop' : 'play'} size={16} color="#fff" />
        <Text style={styles.btnText}>{running ? 'Stop & Save' : 'Start Breathing'}</Text>
      </TouchableOpacity>

      <View style={styles.historySection}>
        <Text style={styles.historyHeading}>Previous Breathing Exercises ({logs.length})</Text>
        {logs.length === 0 ? (
          <Text style={styles.emptyHistoryHint}>
            No breathing sessions recorded yet. Start and stop a session to log it.
          </Text>
        ) : (
          logs.map((item, i) => (
            <View key={item.id || i} style={styles.historyItem}>
              <Text style={styles.historyTitle}>
                Breathing Exercise ({item.durationSec || 1}s)
              </Text>
              <Text style={styles.entryTime}>
                {formatDateTime(item.completedAt || item.time)}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

/* ================================================================
   JOURNAL TOOL
   ================================================================ */
function JournalTool() {
  const [entries, setEntries] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [prompt, setPrompt] = useState('What made you feel stressed today?');

  useEffect(() => {
    AsyncStorage.getItem(JOURNAL_KEY).then((r) => {
      if (r) {
        try {
          const parsed = JSON.parse(r);
          if (Array.isArray(parsed)) setEntries(parsed);
        } catch {}
      }
    });
  }, []);

  async function save() {
    if (!text.trim()) return;
    const nowIso = new Date().toISOString();
    const e = {
      id: `journal-${Date.now()}`,
      prompt,
      text,
      createdAt: nowIso,
      time: formatDateTime(nowIso),
    };
    const updated = [e, ...entries];
    setEntries(updated);
    await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(updated));
    setText('');
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>📝 Journal</Text>
      <TextInput
        style={[styles.input, { marginBottom: 8 }]}
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Prompt"
        placeholderTextColor="#64748b"
      />
      <TextInput
        style={styles.textarea}
        value={text}
        onChangeText={setText}
        placeholder="Write your thoughts..."
        placeholderTextColor="#64748b"
        multiline
      />
      <TouchableOpacity style={styles.btnPrimary} onPress={save}>
        <Ionicons name="save" size={16} color="#fff" />
        <Text style={styles.btnText}>Save Entry</Text>
      </TouchableOpacity>

      {entries.slice(0, 10).map((e, i) => (
        <View key={e.id || i} style={styles.entry}>
          <View style={styles.entryTopRow}>
            <Text style={styles.entryPrompt}>{e.prompt}</Text>
            <Text style={styles.entryTime}>
              {formatDateTime(e.createdAt || e.time)}
            </Text>
          </View>
          <Text style={styles.entryText}>{e.text}</Text>
        </View>
      ))}
    </View>
  );
}

/* ================================================================
   MEDITATION TOOL — plays flying.mp3 through screen lock / hibernation
   ================================================================ */
function MeditationTool() {
  const [minutes, setMinutes] = useState('5');
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const sessionsRef = useRef<any[]>([]);
  const intervalRef = useRef<any>(null);
  const targetMinsRef = useRef<number>(5);
  const endsAtRef = useRef<number | null>(null);
  const remainingRef = useRef<number>(0);

  const player = useAudioPlayer(require('../../../assets/audio/flying.mp3'));
  const status = useAudioPlayerStatus(player);

  const loadMeditationSessions = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MEDITATION_LOG_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      sessionsRef.current = list;
      setSessions(list);
    } catch {}
  }, []);

  useEffect(() => {
    loadMeditationSessions();
  }, [loadMeditationSessions]);

  const configureBackgroundAudio = useCallback(async () => {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
    } catch (e) {
      console.warn('Failed to set background audio mode:', e);
    }
  }, []);

  useEffect(() => {
    if (!player) return;
    player.loop = true;
    player.volume = 0.6;
    configureBackgroundAudio();
  }, [player, configureBackgroundAudio]);

  const saveSession = useCallback(
    async (elapsedSec: number, plannedMins: number, completed: boolean) => {
      const nowIso = new Date().toISOString();
      const minsDisplay =
        elapsedSec >= 60
          ? `${Math.round(elapsedSec / 60)} min`
          : `${Math.max(1, Math.round(elapsedSec))}s`;

      const record = {
        id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        plannedMins,
        durationLabel: minsDisplay,
        completed,
        completedAt: nowIso,
      };

      const updated = [record, ...sessionsRef.current].slice(0, 20);
      sessionsRef.current = updated;
      setSessions(updated);
      try {
        await AsyncStorage.setItem(MEDITATION_LOG_KEY, JSON.stringify(updated));
      } catch {}
    },
    [],
  );

  const finishSession = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const planned = targetMinsRef.current;
    endsAtRef.current = null;
    remainingRef.current = 0;
    setRunning(false);
    setSeconds(0);
    try {
      player.pause();
      player.seekTo(0);
    } catch {}
    await saveSession(planned * 60, planned, true);
    Alert.alert('Meditation complete 🧘');
  }, [player, saveSession]);

  useEffect(() => {
    if (!running) return;

    const tick = () => {
      if (!endsAtRef.current) return;
      const left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
      remainingRef.current = left;
      setSeconds(left);
      if (left <= 0) {
        finishSession();
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, finishSession]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  async function start() {
    const m = parseInt(minutes, 10);
    if (!m || m < 1 || m > 60) {
      return Alert.alert('Enter valid minutes (1–60)');
    }

    await configureBackgroundAudio();

    const totalSec = m * 60;
    targetMinsRef.current = m;
    endsAtRef.current = Date.now() + totalSec * 1000;
    remainingRef.current = totalSec;
    setSeconds(totalSec);
    setRunning(true);

    try {
      player.seekTo(0);
      player.play();
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }

  async function stop() {
    const totalSec = targetMinsRef.current * 60;
    const currentRemaining = endsAtRef.current
      ? Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000))
      : remainingRef.current;
    const elapsedSec = Math.max(1, totalSec - currentRemaining);
    const planned = targetMinsRef.current;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    endsAtRef.current = null;
    remainingRef.current = 0;
    setRunning(false);
    setSeconds(0);

    try {
      player.pause();
      player.seekTo(0);
    } catch {}

    await saveSession(elapsedSec, planned, false);
  }

  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>🧘 Meditation</Text>

      <View style={styles.timerBox}>
        <Text style={styles.timerText}>
          {running ? `${String(mm).padStart(2, '0')}:${ss}` : 'Ready'}
        </Text>
        {running && status?.playing && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Ionicons name="musical-notes" size={12} color="#a78bfa" />
            <Text style={{ color: '#a78bfa', fontSize: 11 }}>
              Playing ambient audio (continues on lock)
            </Text>
          </View>
        )}
      </View>

      {!running ? (
        <>
          <TextInput
            style={styles.input}
            value={minutes}
            onChangeText={setMinutes}
            placeholder="Minutes (e.g. 5)"
            placeholderTextColor="#64748b"
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.btnPrimary} onPress={start}>
            <Ionicons name="play" size={16} color="#fff" />
            <Text style={styles.btnText}>Start Timer</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: Colors.danger }]}
          onPress={stop}
        >
          <Ionicons name="stop" size={16} color="#fff" />
          <Text style={styles.btnText}>Stop & Save</Text>
        </TouchableOpacity>
      )}

      <View style={styles.historySection}>
        <Text style={styles.historyHeading}>Previous Meditation Exercises ({sessions.length})</Text>
        {sessions.length === 0 ? (
          <Text style={styles.emptyHistoryHint}>
            No meditation sessions recorded yet. Start a timer to log a session.
          </Text>
        ) : (
          sessions.map((s, i) => (
            <View key={s.id || i} style={styles.historyItem}>
              <Text style={styles.historyTitle}>
                {s.durationLabel || `${s.elapsedMins || s.plannedMins || 1} min`}{' '}
                {s.completed ? '(Completed)' : '(Logged)'}
              </Text>
              <Text style={styles.entryTime}>
                {formatDateTime(s.completedAt || s.time)}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

/* ================================================================
   HABITS TOOL
   ================================================================ */
function HabitsTool() {
  const [habits, setHabits] = useState<any[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(HABITS_KEY).then((r) => {
      if (r) {
        try {
          const parsed = JSON.parse(r);
          if (Array.isArray(parsed)) setHabits(parsed);
        } catch {}
      }
    });
  }, []);

  async function save(h: any[]) {
    setHabits(h);
    await AsyncStorage.setItem(HABITS_KEY, JSON.stringify(h));
  }

  async function add() {
    if (!input.trim()) return;
    const nowIso = new Date().toISOString();
    await save([
      ...habits,
      {
        id: `habit-${Date.now()}`,
        name: input.trim(),
        streak: 0,
        lastDone: null,
        lastDoneAt: null,
        createdAt: nowIso,
      },
    ]);
    setInput('');
  }

  async function markDone(index: number) {
    const now = new Date();
    const today = now.toDateString();
    const updated = [...habits];
    if (updated[index].lastDone !== today) {
      updated[index].streak += 1;
      updated[index].lastDone = today;
      updated[index].lastDoneAt = now.toISOString();
      await save(updated);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>🎯 Habit Tracker</Text>
      <TextInput
        style={styles.input}
        value={input}
        onChangeText={setInput}
        placeholder="Add habit (e.g. Drink water)"
        placeholderTextColor="#64748b"
      />
      <TouchableOpacity style={styles.btnPrimary} onPress={add}>
        <Ionicons name="add" size={16} color="#fff" />
        <Text style={styles.btnText}>Add Habit</Text>
      </TouchableOpacity>

      {habits.map((h, i) => (
        <View key={h.id || i} style={styles.habit}>
          <TouchableOpacity style={styles.habitCheck} onPress={() => markDone(i)}>
            <Ionicons name="checkmark" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.habitName}>{h.name}</Text>
            <Text style={styles.habitStreak}>🔥 {h.streak}-day streak</Text>
            <Text style={styles.entryTime}>
              {h.lastDoneAt
                ? `Last completed: ${formatDateTime(h.lastDoneAt)}`
                : h.createdAt
                  ? `Added: ${formatDateTime(h.createdAt)}`
                  : 'Not completed yet'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ================================================================
   STYLES
   ================================================================ */
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  micHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micHeaderBtnActive: {
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

  tabsRow: {
    paddingHorizontal: Spacing.md,
    gap: 8,
    paddingBottom: Spacing.md,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tabText: { color: Colors.textMuted, fontSize: 13, fontWeight: '500', flexShrink: 0 },
  tabTextActive: { color: '#fff', fontWeight: '600' },

  scrollContent: { paddingHorizontal: Spacing.md, paddingBottom: 120 },

  card: {
    backgroundColor: Colors.glass,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.md,
    textAlign: 'center',
  },

  stage: { alignItems: 'center', paddingVertical: Spacing.xl },
  breathCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#7b2cbf',
    alignItems: 'center',
    justifyContent: 'center',
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

  input: {
    backgroundColor: '#0f172a',
    color: '#fff',
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#253a5c',
    fontSize: 13.5,
  },
  textarea: {
    backgroundColor: '#0f172a',
    color: '#fff',
    borderRadius: Radius.md,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#253a5c',
    fontSize: 13.5,
  },

  entry: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.md,
    padding: 10,
    marginTop: 8,
  },
  entryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  entryPrompt: { color: Colors.accentLight, fontSize: 11, fontWeight: '600', flex: 1 },
  entryText: { color: '#fff', fontSize: 13, marginTop: 4 },
  entryTime: { color: Colors.textMuted, fontSize: 10.5, marginTop: 3 },

  historySection: {
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: Spacing.md,
  },
  historyHeading: {
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyHistoryHint: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.md,
    padding: 10,
    marginTop: 6,
    gap: 8,
  },
  historyTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },

  timerBox: {
    backgroundColor: 'rgba(123,44,191,0.2)',
    borderRadius: Radius.md,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  timerText: { color: '#fff', fontSize: 42, fontWeight: '700', fontFamily: 'monospace' },

  habit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.md,
    padding: 12,
    marginTop: 8,
  },
  habitCheck: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitName: { color: '#fff', fontSize: 14, fontWeight: '500' },
  habitStreak: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
});
