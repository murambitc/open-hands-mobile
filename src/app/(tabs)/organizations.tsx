import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  Linking, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PanicButton } from '@/components/PanicButton';
import * as db from '@/services/db';
import * as api from '@/services/api';
import { checkOnline } from '@/services/network';

export default function OrganizationsScreen() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => { load(); }, []);
async function load() {
    setLoading(true);
    
    // 1. Try fetching fresh data from the main database if online
    if (checkOnline()) {
      try {
        const fetchedOrgs = await api.fetchOrganizations();
        const orgsArray = Array.isArray(fetchedOrgs) 
          ? fetchedOrgs 
          : Array.isArray(fetchedOrgs?.data) 
          ? fetchedOrgs.data 
          : null;

        if (orgsArray) {
          console.log('Successfully fetched fresh organizations from DB:', orgsArray.length);
          await db.cacheOrganizations(orgsArray);
          setOrgs(orgsArray);
          setLoading(false);
          return;
        }
      } catch (e: any) {
        // This will print the exact reason the connection failed in your metro bundler terminal
        console.error('❌ Failed to fetch organizations from live database:', e.message || e);
      }
    } else {
      console.log('Device is offline. Loading from local SQLite cache.');
    }

    // 2. Fallback to local SQLite cache
    const cached = await db.getCachedOrganizations();
    setOrgs(cached || []);
    setLoading(false);
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <>
      <ScreenContainer>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>🏢 Directory</Text>
            <Text style={styles.subtitle}>Verified support organizations</Text>
          </View>
          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={() => router.push('/map')}
          >
            <Ionicons name="map" size={18} color="#fff" />
          </TouchableOpacity>
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
            {orgs.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ fontSize: 48 }}>🏢</Text>
                <Text style={styles.emptyText}>No organizations yet.</Text>
              </View>
            ) : (
              orgs.map((org) => {
                const logoUri = org.logo_url;
                return (
                  <TouchableOpacity
                    key={org.id}
                    style={styles.card}
                    onPress={() => setSelected(org)}
                    activeOpacity={0.8}
                  >
                    {logoUri ? (
                      <Image source={{ uri: logoUri }} style={styles.logoImg} />
                    ) : (
                      <View style={styles.logoFallback}>
                        <Text style={styles.logoInitial}>{org.name?.charAt(0)}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{org.name}</Text>
                      <Text style={styles.desc} numberOfLines={2}>{org.description}</Text>
                      {org.website ? (
                        <Text style={styles.websiteText} numberOfLines={1}>🌐 {org.website}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                );
              })
            )}
            <View style={{ height: 100 }} />
          </ScrollView>
        )}

        <PanicButton />
      </ScreenContainer>

      <Modal visible={!!selected} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{selected?.name}</Text>
            <Text style={styles.modalDesc}>{selected?.description}</Text>

            {selected?.phone ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#0f172a' }]}
                onPress={() => Linking.openURL(`tel:${selected.phone}`)}
              >
                <Ionicons name="call" size={16} color="#fff" />
                <Text style={styles.actionText}>Call {selected.phone}</Text>
              </TouchableOpacity>
            ) : null}

            {selected?.whatsapp ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                onPress={() => {
                  const msg = encodeURIComponent(`Hello, I need help from ${selected.name}`);
                  Linking.openURL(`https://wa.me/${selected.whatsapp}?text=${msg}`);
                }}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                <Text style={styles.actionText}>WhatsApp</Text>
              </TouchableOpacity>
            ) : null}

            {selected?.email ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#3b82f6' }]}
                onPress={() => Linking.openURL(`mailto:${selected.email}`)}
              >
                <Ionicons name="mail" size={16} color="#fff" />
                <Text style={styles.actionText}>Email</Text>
              </TouchableOpacity>
            ) : null}

            {selected?.website ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#0891b2' }]}
                onPress={() => {
                  const url = selected.website.startsWith('http') 
                    ? selected.website 
                    : `https://${selected.website}`;
                  Linking.openURL(url);
                }}
              >
                <Ionicons name="globe" size={16} color="#fff" />
                <Text style={styles.actionText}>🌐 {selected.website}</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Colors.accent }]}
              onPress={() => setSelected(null)}
            >
              <Text style={styles.actionText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    paddingHorizontal: Spacing.md, paddingTop: 12, paddingBottom: 8 
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.glass,
    borderWidth: 1, borderColor: Colors.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  scrollContent: { paddingHorizontal: Spacing.md, paddingBottom: 120 },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyText: { color: Colors.textMuted, fontSize: 14, marginTop: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.glass, borderRadius: Radius.lg, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.glassBorder,
  },
  logoImg: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#fff', resizeMode: 'cover',
  },
  logoFallback: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  logoInitial: { color: '#fff', fontSize: 20, fontWeight: '700' },
  name: { color: '#fff', fontSize: 14, fontWeight: '600' },
  desc: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  websiteText: { color: Colors.accentLight, fontSize: 11, marginTop: 4 },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', padding: 20,
  },
  modalBox: { backgroundColor: '#1b2a47', borderRadius: Radius.lg, padding: Spacing.lg },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  modalDesc: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: Spacing.md },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 12, borderRadius: Radius.md, marginBottom: 8,
  },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});