import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  RefreshControl,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { requireOptionalNativeModule } from 'expo-modules-core';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { Colors, Radius, Spacing } from '@/constants/theme';
import * as api from '@/services/api';
import { checkOnline } from '@/services/network';
import { parseVoiceCommand } from '@/services/voiceCommands';

const CHAT_CACHE_KEY = 'oh_chat_messages_v1';

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

export interface ChatMessage {
  id: string | number;
  sender?: 'user' | 'assistant' | 'support' | 'system' | string;
  role?: 'user' | 'assistant' | 'system' | string;
  text: string;
  createdAt?: string;
  pending?: boolean;
  isError?: boolean;
}

function formatMessageTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'HH:mm');
}

function normalizeMessage(raw: any, index = 0): ChatMessage {
  const text = String(
    raw?.message ?? raw?.body ?? raw?.content ?? raw?.text ?? raw?.reply ?? '',
  ).trim();

  const rawSender = String(
    raw?.sender ?? raw?.role ?? raw?.from ?? (raw?.is_user ? 'user' : 'assistant'),
  ).toLowerCase();

  const isUser =
    rawSender === 'user' ||
    rawSender === 'me' ||
    rawSender === 'client' ||
    rawSender === 'patient' ||
    raw?.is_me === true ||
    raw?.from_user === true;

  const createdAt =
    raw?.created_at ?? raw?.createdAt ?? raw?.timestamp ?? new Date().toISOString();

  return {
    id: raw?.id ?? raw?.uuid ?? `msg-${Date.now()}-${index}`,
    sender: isUser ? 'user' : rawSender || 'assistant',
    role: isUser ? 'user' : 'assistant',
    text,
    createdAt,
    pending: Boolean(raw?.pending),
  };
}

function extractMessagesList(res: any): ChatMessage[] | null {
  const candidates = [
    res?.data?.messages,
    res?.messages,
    res?.data?.data,
    res?.data,
    res,
  ];

  for (const list of candidates) {
    if (Array.isArray(list)) {
      return list
        .map((item, idx) => normalizeMessage(item, idx))
        .filter((m) => m.text.length > 0);
    }
  }
  return null;
}

function extractReplyText(res: any): string | null {
  const candidates = [
    res?.data?.reply,
    res?.reply,
    res?.data?.response,
    res?.response,
    res?.data?.answer,
    res?.answer,
    res?.data?.text,
    res?.data?.message,
    typeof res?.data === 'string' ? res.data : null,
    res?.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const trimmed = candidate.trim();
      if (trimmed.toLowerCase() !== 'success' && trimmed.toLowerCase() !== 'ok') {
        return trimmed;
      }
    }
  }
  return null;
}

function formatChatError(err: any): string {
  const status = err?.response?.status;
  const serverMsg =
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    (typeof err?.response?.data === 'string' ? err.response.data : '');

  if (
    err?.code === 'ECONNABORTED' ||
    String(err?.message || '').toLowerCase().includes('timeout')
  ) {
    return "I couldn't reach the AI (request timed out). Please try again in a moment.";
  }

  if (status) {
    const detail = serverMsg ? `: ${String(serverMsg).slice(0, 140)}` : '';
    return `I couldn't reach the AI (HTTP ${status}${detail}). Please try again later.`;
  }

  const netMsg = err?.message ? ` (${err.message})` : '';
  return `I couldn't reach the AI${netMsg}. Please check your internet connection and try again.`;
}

async function ensureAuthToken(): Promise<string | null> {
  if (typeof api.getAuthToken !== 'function') return null;
  let token = await api.getAuthToken();
  if (!token && typeof api.guestLogin === 'function') {
    try {
      await api.guestLogin();
      token = await api.getAuthToken();
    } catch {}
  }
  return token;
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ initialPrompt?: string }>();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const consumedInitialPromptRef = useRef<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');

  const persistCache = useCallback(async (items: ChatMessage[]) => {
    try {
      const clean = items.filter((m) => !m.isError).slice(-100);
      await AsyncStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(clean));
    } catch {}
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          listRef.current?.scrollToEnd({ animated });
        } catch {}
      }, 60);
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      scrollToBottom(true);
    });
    return () => sub.remove();
  }, [scrollToBottom]);

  const loadMessages = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);

      let cachedList: ChatMessage[] = [];
      try {
        const raw = await AsyncStorage.getItem(CHAT_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            cachedList = parsed;
            setMessages(parsed);
          }
        }
      } catch {}

      setLoading(false);

      const online = await checkOnline();
      setIsOnline(online);

      if (online && typeof (api as any).fetchChat === 'function') {
        try {
          await ensureAuthToken();
          const res = await (api as any).fetchChat();
          const remoteList = extractMessagesList(res);
          if (remoteList && remoteList.length > 0) {
            const pendingLocal = cachedList.filter((m) => m.pending);
            const merged = [...remoteList, ...pendingLocal];
            setMessages(merged);
            await persistCache(merged);
          }
        } catch (err: any) {
          console.warn('fetchChat failed:', {
            status: err?.response?.status,
            message: err?.message,
          });
        }
      }

      scrollToBottom(false);
    },
    [persistCache, scrollToBottom],
  );

  useEffect(() => {
    loadMessages(true);
  }, [loadMessages]);

  useFocusEffect(
    useCallback(() => {
      loadMessages(false);
    }, [loadMessages]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        loadMessages(false);
      }
    });
    return () => sub.remove();
  }, [loadMessages]);

  useEffect(() => {
    return () => {
      try {
        SpeechModule?.stop?.();
      } catch {}
    };
  }, []);

  const postChatWithRetry = useCallback(async (messageText: string) => {
    await ensureAuthToken();

    const payload = {
      message: messageText,
      text: messageText,
      prompt: messageText,
    };

    try {
      return await api.default.post('/chat', payload, { timeout: 60000 });
    } catch (err: any) {
      if (err?.response?.status === 401 && typeof api.guestLogin === 'function') {
        await api.guestLogin();
        return await api.default.post('/chat', payload, { timeout: 60000 });
      }
      throw err;
    }
  }, []);

  const sendTextMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || sending) return;

      const nowIso = new Date().toISOString();
      const tempId = `local-${Date.now()}`;
      const optimisticMsg: ChatMessage = {
        id: tempId,
        sender: 'user',
        role: 'user',
        text: trimmed,
        createdAt: nowIso,
        pending: true,
      };

      let nextWithUser: ChatMessage[] = [];
      setMessages((prev) => {
        nextWithUser = [...prev.filter((m) => !m.isError), optimisticMsg];
        return nextWithUser;
      });
      setInput('');
      await persistCache(nextWithUser);
      scrollToBottom(true);

      const online = await checkOnline();
      setIsOnline(online);
      if (!online) {
        const offlineNotice: ChatMessage = {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          role: 'assistant',
          text: 'You appear to be offline. Your message was saved and you can retry once connected.',
          createdAt: new Date().toISOString(),
          isError: true,
        };
        setMessages((prev) => [...prev, offlineNotice]);
        scrollToBottom(true);
        return;
      }

      setSending(true);
      try {
        const response = await postChatWithRetry(trimmed);
        const res = response?.data ?? response;

        const returnedList = extractMessagesList(res);
        if (returnedList && returnedList.length > 0) {
          setMessages(returnedList);
          await persistCache(returnedList);
        } else {
          const replyText = extractReplyText(res);

          const updated: ChatMessage[] = nextWithUser.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  id: res?.data?.id ?? res?.id ?? m.id,
                  pending: false,
                }
              : m,
          );

          if (replyText) {
            updated.push({
              id: `bot-${Date.now()}`,
              sender: 'assistant',
              role: 'assistant',
              text: replyText,
              createdAt: new Date().toISOString(),
              pending: false,
            });
          }

          setMessages(updated);
          await persistCache(updated);
        }
      } catch (err: any) {
        console.warn('sendChatMessage failed:', {
          message: err?.message,
          code: err?.code,
          status: err?.response?.status,
          data: err?.response?.data,
        });

        const errorBubble: ChatMessage = {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          role: 'assistant',
          text: formatChatError(err),
          createdAt: new Date().toISOString(),
          isError: true,
        };

        setMessages((prev) => [...prev, errorBubble]);
      } finally {
        setSending(false);
        scrollToBottom(true);
      }
    },
    [persistCache, postChatWithRetry, scrollToBottom, sending],
  );

  useEffect(() => {
    const incoming = String(params?.initialPrompt ?? '').trim();
    if (!loading && incoming && consumedInitialPromptRef.current !== incoming) {
      consumedInitialPromptRef.current = incoming;
      sendTextMessage(incoming);
    }
  }, [loading, params?.initialPrompt, sendTextMessage]);

  const handleSend = useCallback(() => {
    sendTextMessage(input);
  }, [input, sendTextMessage]);

  async function onRefresh() {
    setRefreshing(true);
    await loadMessages(false);
    setRefreshing(false);
  }

  /* ================================================================
     SPEECH RECOGNITION / VOICE COMMANDS (SAFE FALLBACK)
     ================================================================ */
  useSafeSpeechEvent('start', () => {
    setListening(true);
    setLiveTranscript('');
  });

  useSafeSpeechEvent('end', () => {
    setListening(false);
  });

  useSafeSpeechEvent('result', (event: any) => {
    const transcript = String(event?.results?.[0]?.transcript ?? '').trim();
    const isFinal = Boolean(event?.isFinal);

    if (transcript) {
      setLiveTranscript(transcript);
      setInput(transcript);
    }

    if (isFinal && transcript) {
      setLiveTranscript('');
      const action = parseVoiceCommand(transcript);

      if (action.type === 'navigate' && action.route !== '/chat') {
        setInput('');
        router.push(action.route);
        return;
      }

      sendTextMessage(transcript);
    }
  });

  useSafeSpeechEvent('error', (event: any) => {
    setListening(false);
    setLiveTranscript('');
    const code = event?.error || event?.code || 'unknown';
    if (code !== 'no-speech' && code !== 'aborted') {
      Toast.show({
        type: 'error',
        text1: 'Voice input error',
        text2: String(event?.message || code),
      });
    }
  });

  async function toggleVoiceInput() {
    if (listening) {
      try {
        SpeechModule?.stop?.();
      } catch {}
      setListening(false);
      return;
    }

    if (sending) return;

    if (!hasNativeSpeechModule || !SpeechModule) {
      Toast.show({
        type: 'info',
        text1: 'Voice commands require a native build',
        text2: 'Type your message or use a dev/production build with native speech enabled.',
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
          text1: 'Voice input unavailable',
          text2: 'Speech recognition is not supported on this device.',
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
          text2: 'Please allow microphone and speech recognition access.',
        });
        return;
      }

      Keyboard.dismiss();
      setLiveTranscript('');
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
        text2: String(err?.message || 'Unable to start voice recognition'),
      });
    }
  }

  function renderMessage({ item }: { item: ChatMessage }) {
    const isUser = item.sender === 'user' || item.role === 'user';

    return (
      <View
        style={[
          styles.bubbleRow,
          isUser ? styles.bubbleRowUser : styles.bubbleRowOther,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isUser
              ? styles.bubbleUser
              : item.isError
                ? styles.bubbleError
                : styles.bubbleOther,
          ]}
        >
          <Text style={styles.bubbleText}>{item.text}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.timeText}>{formatMessageTime(item.createdAt)}</Text>
            {isUser && (
              <Ionicons
                name={item.pending ? 'time-outline' : 'checkmark-done'}
                size={12}
                color={item.pending ? '#cbd5e1' : '#fbcfe8'}
              />
            )}
          </View>
        </View>
      </View>
    );
  }

  const keyboardOffset = Platform.OS === 'ios' ? insets.top + insets.bottom : 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
      >
        {/* Top Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={styles.backBtn}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.title}>💬 Support & Wellness Chat</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isOnline ? '#22c55e' : '#f59e0b' },
                ]}
              />
              <Text style={styles.subtitle}>
                {isOnline
                  ? hasNativeSpeechModule
                    ? 'Connected • Voice enabled'
                    : 'Connected'
                  : 'Offline mode — messages saved locally'}
              </Text>
            </View>
          </View>
        </View>

        {/* Messages List */}
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item, idx) => String(item.id ?? idx)}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollToBottom(false)}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#fff"
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 44 }}>💬</Text>
                <Text style={styles.emptyTitle}>Start a conversation</Text>
                <Text style={styles.emptySubtitle}>
                  Type a message or tap the microphone to speak a question or voice command.
                </Text>
              </View>
            }
          />
        )}

        {/* Voice listening banner */}
        {listening && (
          <View style={styles.listeningBanner}>
            <Ionicons name="mic" size={15} color={Colors.accentLight} />
            <Text style={styles.listeningText} numberOfLines={2}>
              {liveTranscript
                ? `Listening: “${liveTranscript}”`
                : 'Listening... Speak your message or command'}
            </Text>
          </View>
        )}

        {/* Typing indicator */}
        {sending && (
          <View style={styles.typingBanner}>
            <ActivityIndicator size="small" color={Colors.accentLight} />
            <Text style={styles.typingText}>AI is thinking...</Text>
          </View>
        )}

        {/* Composer */}
        <View style={[styles.composerBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TouchableOpacity
            style={[styles.micBtn, listening && styles.micBtnActive]}
            onPress={toggleVoiceInput}
            disabled={sending}
            activeOpacity={0.8}
            accessibilityLabel={listening ? 'Stop listening' : 'Speak message'}
          >
            {listening ? (
              <Ionicons name="stop" size={18} color="#fff" />
            ) : (
              <Ionicons name="mic" size={19} color="#fff" />
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            onFocus={() => scrollToBottom(true)}
            placeholder={listening ? 'Listening...' : 'Type or tap mic to speak...'}
            placeholderTextColor="#64748b"
            multiline
            maxLength={1000}
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || sending) && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  subtitle: { color: Colors.textMuted, fontSize: 12 },

  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    flexGrow: 1,
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptySubtitle: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },

  bubbleRow: {
    marginBottom: 10,
    flexDirection: 'row',
  },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '82%',
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  bubbleUser: {
    backgroundColor: Colors.accent,
    borderColor: 'rgba(255,255,255,0.14)',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderBottomLeftRadius: 4,
  },
  bubbleError: {
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderColor: 'rgba(239, 68, 68, 0.45)',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  timeText: { color: 'rgba(255,255,255,0.65)', fontSize: 10.5 },

  listeningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: 'rgba(190, 24, 93, 0.2)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 77, 141, 0.3)',
  },
  listeningText: {
    flex: 1,
    color: '#fbcfe8',
    fontSize: 12.5,
    fontWeight: '500',
  },

  typingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  typingText: {
    color: Colors.textMuted,
    fontSize: 12,
  },

  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0b1220',
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: {
    backgroundColor: Colors.danger,
    borderColor: '#fca5a5',
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    backgroundColor: '#0f172a',
    color: '#fff',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#253a5c',
    fontSize: 14,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },
});