import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as api from '@/services/api';
import * as db from '@/services/db';
import { checkOnline } from '@/services/network';
import { useAuth } from '@/store/authStore';

interface Props { visible: boolean; onClose: () => void; }

export function ChatModal({ visible, onClose }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<{ sender: string; message: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible && user) loadHistory();
  }, [visible, user]);

  async function loadHistory() {
    if (!user) return;
    const local = await db.getChatLocal(user.id);
    if (local.length) {
      setMessages(local.map((m) => ({ sender: m.sender, message: m.message })));
    } else {
      setMessages([{ sender: 'bot', message: 'Hello 👋 How can I help?' }]);
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !user) return;
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', message: text }]);
    await db.saveChatLocal(user.id, 'user', text);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    if (!checkOnline()) {
      const offlineMsg = "You're offline. Your message is saved — I'll reply when you reconnect.";
      setMessages((prev) => [...prev, { sender: 'bot', message: offlineMsg }]);
      await db.saveChatLocal(user.id, 'bot', offlineMsg);
      return;
    }

    setLoading(true);
    try {
      const res = await api.sendChat(text);
      const reply = res.reply || res.data?.reply || 'Sorry, I could not respond.';
      setMessages((prev) => [...prev, { sender: 'bot', message: reply }]);
      await db.saveChatLocal(user.id, 'bot', reply);
    } catch {
      const errMsg = "I couldn't reach the AI. Please try again later.";
      setMessages((prev) => [...prev, { sender: 'bot', message: errMsg }]);
      await db.saveChatLocal(user.id, 'bot', errMsg);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  const bottomPadding = Math.max(insets.bottom, Spacing.md);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 12}
        style={styles.overlay}
      >
        <View style={[styles.box, { paddingBottom: bottomPadding }]}>
          <LinearGradient colors={['#2F5DAA', '#1e3a8a']} style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.avatar}>
                <Ionicons name="sparkles" size={18} color="#fff" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Open Hands AI</Text>
                <Text style={styles.headerSub}>Always here for you</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView
            ref={scrollRef}
            style={styles.msgsScroll}
            contentContainerStyle={styles.msgs}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((m, i) => (
              <View
                key={i}
                style={[styles.bubble, m.sender === 'user' ? styles.userBubble : styles.botBubble]}
              >
                <Text style={[styles.msgText, m.sender === 'user' && styles.userText]}>
                  {m.message}
                </Text>
              </View>
            ))}
            {loading && (
              <View style={[styles.bubble, styles.botBubble]}>
                <ActivityIndicator size="small" color={Colors.textMuted} />
              </View>
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Type a message..."
              placeholderTextColor="#64748b"
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={loading}>
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  box: {
    backgroundColor: 'rgba(11,18,32,0.98)',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    height: '82%',
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  msgsScroll: { flex: 1 },
  msgs: { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1 },
  bubble: { maxWidth: '82%', padding: 12, borderRadius: 14 },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 4,
  },
  msgText: { color: Colors.text, fontSize: 13, lineHeight: 19 },
  userText: { color: '#fff' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
    backgroundColor: 'rgba(11,18,32,0.98)',
  },
  input: {
    flex: 1, backgroundColor: '#fff', color: '#000',
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 13,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
});
