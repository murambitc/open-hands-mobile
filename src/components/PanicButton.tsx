import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as db from '@/services/db';
import * as api from '@/services/api';
import { checkOnline } from '@/services/network';

export function PanicButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function trigger() {
    setBusy(true);
    let lat: number | null = null;
    let lng: number | null = null;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ timeout: 5000 });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
    } catch {}

    try {
      if (checkOnline()) {
        await api.pushPanic(lat, lng);
      } else {
        await db.savePanicLocal(lat, lng);
      }
    } catch {
      await db.savePanicLocal(lat, lng);
    }

    const msg = encodeURIComponent(
      `🚨 EMERGENCY! I need help.${lat ? `\nMy location: https://maps.google.com/?q=${lat},${lng}` : ''}`,
    );
    try { await Linking.openURL(`https://wa.me/26777649963?text=${msg}`); } catch {}
    try { await Linking.openURL('tel:999'); } catch {}

    setBusy(false);
    setOpen(false);
  }

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Text style={{ fontSize: 22 }}>🚨</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.box}>
            <Text style={styles.emoji}>🚨</Text>
            <Text style={styles.title}>Emergency Help</Text>
            <Text style={styles.sub}>
              This will call emergency services and share your location.
            </Text>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#22c55e' }]}
              onPress={trigger}
              disabled={busy}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={styles.btnText}>{busy ? 'Connecting...' : 'Emergency WhatsApp'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: Colors.danger }]}
              onPress={() => Linking.openURL('tel:999')}
            >
              <Ionicons name="call" size={18} color="#fff" />
              <Text style={styles.btnText}>Call Police (999)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#0891b2' }]}
              onPress={() => Linking.openURL('tel:997')}
            >
              <Ionicons name="medkit" size={18} color="#fff" />
              <Text style={styles.btnText}>Call Ambulance (997)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancel} onPress={() => setOpen(false)}>
              <Text style={{ color: Colors.textMuted }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', bottom: 90, left: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.danger,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6, shadowRadius: 12, elevation: 10,
  },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  box: {
    backgroundColor: 'rgba(11,18,32,0.98)', borderRadius: Radius.lg,
    padding: Spacing.lg, width: '100%', maxWidth: 400,
    borderWidth: 1, borderColor: 'rgba(220,38,38,0.4)', alignItems: 'center',
  },
  emoji: { fontSize: 48, marginBottom: Spacing.sm },
  title: { color: Colors.danger, fontSize: 20, fontWeight: '700', marginBottom: Spacing.sm },
  sub: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: Spacing.lg },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: Spacing.md, borderRadius: Radius.md, width: '100%', marginBottom: Spacing.sm,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cancel: { padding: Spacing.md, width: '100%', alignItems: 'center' },
});