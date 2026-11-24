import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/store/authStore';

export default function LoginScreen() {
  const router = useRouter();
  const { login, guest } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    setError('');
    if (!username || !password) return setError('Enter username and password');
    setLoading(true);
    try {
      await login(username.trim(), password);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGuest() {
    setError('');
    setLoading(true);
    try {
      await guest();
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setError(e.message || 'Guest login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={['#2F5DAA', '#1e3a8a']} style={styles.bg}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <View style={styles.logoWrap}>
                <Image
                  source={require('../../assets/images/icon.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <Text style={styles.logoText}>OPEN<Text style={{ opacity: 0.7 }}> HANDS</Text></Text>
              </View>

              <Text style={styles.subtitle}>Your safe space for support and healing.</Text>

              {error ? (
                <View style={styles.errBox}>
                  <Ionicons name="alert-circle" size={16} color="#fecaca" />
                  <Text style={styles.errText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Username</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person" size={16} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter username"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed" size={16} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor="#64748b"
                  secureTextEntry={!showPw}
                />
                <TouchableOpacity onPress={() => setShowPw(!showPw)}>
                  <Ionicons name={showPw ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="log-in" size={16} color="#fff" />
                    <Text style={styles.btnText}>Sign In</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnOutline} onPress={handleGuest} disabled={loading}>
                <Ionicons name="person-circle" size={16} color="#fff" />
                <Text style={styles.btnText}>Continue as Guest</Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.line} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.line} />
              </View>

              <TouchableOpacity style={styles.btnOutline} onPress={() => router.push('/register')}>
                <Ionicons name="person-add" size={16} color="#fff" />
                <Text style={styles.btnText}>Create an Account</Text>
              </TouchableOpacity>
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
    backgroundColor: '#be185d',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  logoWrap: { alignItems: 'center', marginBottom: Spacing.md },
  logo: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#fff' },
  logoText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1.2, marginTop: 10 },
  subtitle: { color: 'rgba(255,255,255,0.9)', textAlign: 'center', fontSize: 13, marginBottom: Spacing.lg },
  errBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(239,68,68,0.25)',
    padding: Spacing.sm, borderRadius: Radius.md, marginBottom: Spacing.md,
  },
  errText: { color: '#fecaca', fontSize: 13, flex: 1 },
  label: { color: '#fff', fontSize: 13, fontWeight: '500', marginBottom: 4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#152036', borderWidth: 1, borderColor: '#253a5c',
    borderRadius: Radius.md, paddingHorizontal: 12, marginBottom: Spacing.md,
  },
  inputIcon: {},
  input: { flex: 1, color: '#fff', paddingVertical: 12, fontSize: 14 },
  btnPrimary: {
    backgroundColor: '#2F5DAA',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: Radius.md, marginBottom: Spacing.sm,
  },
  btnOutline: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: Radius.md, marginBottom: Spacing.sm,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.md },
  line: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  dividerText: { color: '#fff', paddingHorizontal: 12, fontSize: 12 },
});