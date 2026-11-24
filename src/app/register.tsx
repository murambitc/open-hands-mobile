import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/store/authStore';

const COUNTRIES = ['Botswana', 'South Africa', 'Zimbabwe', 'Namibia', 'Other'];

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    mood: '', safety: '', country: '', location: '',
    name: '', username: '', email: '', password: '', password_confirmation: '',
  });

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setError('');
    if (form.password !== form.password_confirmation) return setError('Passwords do not match');
    setLoading(true);
    try {
      await register({
        name: form.name || form.username,
        username: form.username,
        email: form.email,
        password: form.password,
        password_confirmation: form.password_confirmation,
        mood: form.mood,
        safety: form.safety,
        country: form.country,
        location: form.location,
      });
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setError(e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={['#2F5DAA', '#1e3a8a']} style={styles.bg}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.logoText}>Open Hands</Text>
                <TouchableOpacity onPress={() => router.back()}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <Text style={styles.subtitle}>Create Your Account</Text>

              <View style={styles.stepsRow}>
                {[1, 2, 3].map((s) => (
                  <View key={s} style={styles.stepItem}>
                    <View style={[styles.stepCircle, step >= s && styles.stepActive]}>
                      <Text style={styles.stepText}>{s}</Text>
                    </View>
                    <Text style={styles.stepLabel}>
                      {s === 1 ? 'Wellness' : s === 2 ? 'Location' : 'Account'}
                    </Text>
                  </View>
                ))}
              </View>

              {error ? <Text style={styles.errText}>{error}</Text> : null}

              {step === 1 && (
                <>
                  <Text style={styles.label}>1. How are you feeling today?</Text>
                  <TextInput style={styles.input} value={form.mood}
                    onChangeText={(v) => set('mood', v)} placeholder="e.g. Happy" placeholderTextColor="#64748b" />

                  <Text style={styles.label}>2. Do you feel safe at home/work?</Text>
                  <View style={styles.chipRow}>
                    {['Yes', 'No'].map((o) => (
                      <TouchableOpacity key={o}
                        onPress={() => set('safety', o)}
                        style={[styles.chip, form.safety === o && styles.chipActive]}>
                        <Text style={[styles.chipText, form.safety === o && { color: '#fff' }]}>{o}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity style={styles.btnPrimary}
                    onPress={() => setStep(2)}
                    disabled={!form.mood || !form.safety}>
                    <Text style={styles.btnText}>Next</Text>
                  </TouchableOpacity>
                </>
              )}

              {step === 2 && (
                <>
                  <Text style={styles.label}>Country</Text>
                  <View style={styles.chipRow}>
                    {COUNTRIES.map((c) => (
                      <TouchableOpacity key={c}
                        onPress={() => set('country', c)}
                        style={[styles.chip, form.country === c && styles.chipActive]}>
                        <Text style={[styles.chipText, form.country === c && { color: '#fff' }]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>City / Town / Village</Text>
                  <TextInput style={styles.input} value={form.location}
                    onChangeText={(v) => set('location', v)}
                    placeholder="e.g. Gaborone" placeholderTextColor="#64748b" />

                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    <TouchableOpacity style={[styles.btnOutline, { flex: 1 }]} onPress={() => setStep(1)}>
                      <Text style={styles.btnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]}
                      onPress={() => setStep(3)}
                      disabled={!form.country || !form.location}>
                      <Text style={styles.btnText}>Next</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {step === 3 && (
                <>
                  <Text style={styles.label}>Username</Text>
                  <TextInput style={styles.input} value={form.username} onChangeText={(v) => set('username', v)}
                    placeholder="Choose a username" placeholderTextColor="#64748b" autoCapitalize="none" />

                  <Text style={styles.label}>Email</Text>
                  <TextInput style={styles.input} value={form.email} onChangeText={(v) => set('email', v)}
                    placeholder="your@email.com" placeholderTextColor="#64748b"
                    keyboardType="email-address" autoCapitalize="none" />

                  <Text style={styles.label}>Password</Text>
                  <TextInput style={styles.input} value={form.password} onChangeText={(v) => set('password', v)}
                    placeholder="Choose a password" placeholderTextColor="#64748b" secureTextEntry />

                  <Text style={styles.label}>Confirm Password</Text>
                  <TextInput style={styles.input} value={form.password_confirmation}
                    onChangeText={(v) => set('password_confirmation', v)}
                    placeholder="Confirm password" placeholderTextColor="#64748b" secureTextEntry />

                  <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
                    <TouchableOpacity style={[styles.btnOutline, { flex: 1 }]} onPress={() => setStep(2)}>
                      <Text style={styles.btnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]}
                      onPress={submit} disabled={loading}>
                      {loading ? <ActivityIndicator color="#fff" /> :
                        <Text style={styles.btnText}>Create</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  card: {
    backgroundColor: '#1b2a47', borderRadius: Radius.lg, padding: Spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: Colors.textMuted, fontSize: 14, marginTop: 6, marginBottom: Spacing.lg },
  stepsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.lg },
  stepItem: { alignItems: 'center', flex: 1 },
  stepCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#253a5c', alignItems: 'center', justifyContent: 'center',
  },
  stepActive: { backgroundColor: Colors.accent },
  stepText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  stepLabel: { color: Colors.textMuted, fontSize: 11, marginTop: 6 },
  errText: { color: '#fecaca', fontSize: 13, textAlign: 'center', marginBottom: Spacing.sm },
  label: { color: '#cbd5f5', fontSize: 13, marginBottom: 4, marginTop: Spacing.sm },
  input: {
    backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#253a5c',
    borderRadius: Radius.md, color: '#fff', paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 13.5,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textMuted, fontSize: 13 },
  btnPrimary: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.md,
  },
  btnOutline: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center',
    justifyContent: 'center', marginTop: Spacing.md,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});