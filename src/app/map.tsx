import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/constants/theme';
import * as api from '@/services/api';
import * as db from '@/services/db';
import { checkOnline } from '@/services/network';

export default function SupportMapScreen() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🗺️ MapScreen mounted. Loading organizations...');
    loadOrganizations();
  }, []);

  async function loadOrganizations() {
    try {
      const isOnline = checkOnline();
      console.log(`🌐 MapScreen: Network online status -> ${isOnline}`);

      if (isOnline) {
        console.log('🔄 MapScreen: Fetching fresh organizations from API...');
        const fetchedOrgs = await api.fetchOrganizations();
        const orgsArray = Array.isArray(fetchedOrgs) 
          ? fetchedOrgs 
          : Array.isArray(fetchedOrgs?.data) 
          ? fetchedOrgs.data 
          : null;

        if (orgsArray) {
          console.log(`✅ MapScreen: Successfully fetched ${orgsArray.length} organizations from live database.`);
          await db.cacheOrganizations(orgsArray);
          setOrganizations(orgsArray);
          setLoading(false);
          return;
        } else {
          console.log('⚠️ MapScreen: API response was not a valid array:', fetchedOrgs);
        }
      }
    } catch (e: any) {
      console.log('❌ MapScreen: Online fetch failed, falling back to local cache:', e.message || e);
    }

    console.log('📦 MapScreen: Loading organizations from local SQLite cache...');
    const cached = await db.getCachedOrganizations();
    console.log(`📦 MapScreen: Retrieved ${cached?.length || 0} organizations from local cache.`);
    setOrganizations(cached || []);
    setLoading(false);
  }

  const generateMapHtml = (orgs: any[]) => {
    console.log(`🎨 MapScreen: Generating Leaflet HTML map for ${orgs.length} organizations.`);
    const orgsJson = JSON.stringify(orgs);
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <style>
              html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
              #leafletMap { width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 1; }
              .leaflet-popup-content-wrapper { background: #1b2a47 !important; color: #e2e8f0 !important; border-radius: 12px; padding: 0; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); }
              .leaflet-popup-content { margin: 14px; }
              .leaflet-popup-tip { background: #1b2a47 !important; }
              .leaflet-container a.leaflet-popup-close-button { color: #94a3b8; padding: 8px 8px 0 0; }
              .leaflet-container a.leaflet-popup-close-button:hover { color: #fff; }
          </style>
      </head>
      <body>
          <div id="leafletMap"></div>
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <script>
              document.addEventListener("DOMContentLoaded", function () {
                  console.log("Leaflet DOM loaded successfully.");
                  const map = L.map('leafletMap', { zoomControl: false }).setView([-24.650818, 25.917332], 6);

                  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                      attribution: '&copy; OpenStreetMap contributors',
                      maxZoom: 19
                  }).addTo(map);

                  const organizations = ${orgsJson};
                  console.log("Rendering markers for organizations count:", organizations.length);

                  const markerColors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#dc2626'];
                  let markerBounds = [];

                  organizations.forEach((org, index) => {
                      let lat = parseFloat(org.latitude) || (-24.650818 + (Math.random() - 0.5) * 0.4);
                      let lng = parseFloat(org.longitude) || (25.917332 + (Math.random() - 0.5) * 0.4);
                      let color = markerColors[index % markerColors.length];

                      const svgIcon = L.divIcon({
                          className: 'custom-marker',
                          html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="' + color + '" width="36" height="36" style="filter: drop-shadow(0 4px 4px rgba(0,0,0,0.6));"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
                          iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -36]
                      });

                      let logoHtml = org.logo_url 
                          ? '<img src="' + org.logo_url + '" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-bottom: 8px;" onerror="this.style.display=\\'none\\';">' 
                          : '';

                      let phoneHtml = org.phone ? '<div style="font-size: 12px; margin-top: 4px;"><a href="tel:' + org.phone + '" style="color: #3b82f6; text-decoration: none;">📞 ' + org.phone + '</a></div>' : '';
                      let emailHtml = org.email ? '<div style="font-size: 12px; margin-top: 4px;"><a href="mailto:' + org.email + '" style="color: #3b82f6; text-decoration: none;">✉️ ' + org.email + '</a></div>' : '';
                      let webHtml = org.website ? '<div style="font-size: 12px; margin-top: 4px;"><a href="' + org.website + '" target="_blank" style="color: #0891b2; text-decoration: none;">🌐 ' + org.website + '</a></div>' : '';

                      let popupContent = '<div style="min-width: 200px;">' +
                          logoHtml +
                          '<h4 style="margin: 0 0 6px 0; font-size: 15px; font-weight: 700; color: #fff;">' + org.name + '</h4>' +
                          '<p style="margin: 0 0 8px 0; font-size: 12px; color: #cbd5f5;">' + (org.description ? org.description.substring(0, 80) + '...' : '') + '</p>' +
                          '<hr style="margin: 6px 0; border-color: rgba(255,255,255,0.1);">' + 
                          phoneHtml + emailHtml + webHtml +
                          '</div>';

                      const marker = L.marker([lat, lng], { icon: svgIcon }).bindPopup(popupContent).addTo(map);
                      markerBounds.push([lat, lng]);
                  });

                  if (markerBounds.length > 0) {
                      map.fitBounds(markerBounds, { padding: [40, 40], maxZoom: 14 });
                  }
              });
          </script>
      </body>
      </html>
    `;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Support Partners Map</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.accentLight} />
        </View>
      ) : (
        <WebView
          source={{ html: generateMapHtml(organizations) }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          onMessage={(event) => console.log('🗺️ WebView Message:', event.nativeEvent.data)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    height: 60,
    backgroundColor: 'rgba(11, 18, 32, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    zIndex: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.glass,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  webview: { flex: 1, backgroundColor: '#0f172a' },
});
