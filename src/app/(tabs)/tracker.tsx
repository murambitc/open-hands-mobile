import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, startOfDay, subDays } from 'date-fns';
import { Colors, Spacing } from '@/constants/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PanicButton } from '@/components/PanicButton';
import { useAuth } from '@/store/authStore';
import { moodCategory } from '@/constants/moods';
import * as db from '@/services/db';
import * as api from '@/services/api';
import { checkOnline } from '@/services/network';
import { flushPending } from '@/services/sync';

const FILTERS = [7, 30, 90];

const SERIES_CONFIG = [
  { key: 'positive', label: 'Positive 😊', color: '#22c55e' },
  { key: 'sad', label: 'Sad 😢', color: '#3b82f6' },
  { key: 'stressed', label: 'Stressed 😩', color: '#ef4444' },
  { key: 'angry', label: 'Angry 😡', color: '#f97316' },
  { key: 'calm', label: 'Calm 😌', color: '#06b6d4' },
] as const;

type SeriesKey = (typeof SERIES_CONFIG)[number]['key'];

interface ChartSeriesData {
  keys: string[];
  labels: string[];
  counts: Record<SeriesKey, number[]>;
}

function emptyCounts(len: number): Record<SeriesKey, number[]> {
  return {
    positive: Array(len).fill(0),
    sad: Array(len).fill(0),
    stressed: Array(len).fill(0),
    angry: Array(len).fill(0),
    calm: Array(len).fill(0),
  };
}

function parseLogDate(rawDate: any): Date | null {
  if (!rawDate) return null;
  if (rawDate instanceof Date) {
    return Number.isNaN(rawDate.getTime()) ? null : rawDate;
  }
  const str = String(rawDate).trim();
  if (!str) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(str)
    ? str.replace(' ', 'T')
    : str;
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function normalizeCategory(rawMood: string): SeriesKey {
  const mapped = (moodCategory(rawMood) || '').toLowerCase();
  if (
    mapped === 'positive' ||
    mapped === 'sad' ||
    mapped === 'stressed' ||
    mapped === 'angry' ||
    mapped === 'calm'
  ) {
    return mapped;
  }
  const m = (rawMood || '').toLowerCase();
  if (
    m.includes('happy') ||
    m.includes('joy') ||
    m.includes('excited') ||
    m.includes('loved') ||
    m.includes('confident') ||
    m.includes('grateful')
  ) {
    return 'positive';
  }
  if (m.includes('sad') || m.includes('crying') || m.includes('tired')) return 'sad';
  if (m.includes('stress') || m.includes('anxious') || m.includes('worried')) return 'stressed';
  if (m.includes('angry') || m.includes('frustrated')) return 'angry';
  return 'calm';
}

function buildSeriesFromCheckins(rows: db.LocalCheckin[], days: number): ChartSeriesData {
  const todayStart = startOfDay(new Date());
  const todayKey = format(todayStart, 'yyyy-MM-dd');
  const keys: string[] = [];
  const labels: string[] = [];

  // Inclusive window of `days` ending on today (e.g., 7 -> today minus 6 .. today; 30 -> today minus 29 .. today; 90 -> today minus 89 .. today)
  for (let i = days - 1; i >= 0; i--) {
    const dayDate = subDays(todayStart, i);
    keys.push(format(dayDate, 'yyyy-MM-dd'));
    labels.push(format(dayDate, 'd MMM'));
  }

  const seenServerIds = new Set<number>();
  const seenFingerprints = new Set<string>();
  const uniqueRows = rows.filter((row) => {
    if (row.server_id != null && row.server_id > 0) {
      if (seenServerIds.has(row.server_id)) return false;
      seenServerIds.add(row.server_id);
    }
    const minuteKey = String(row.created_at || '').slice(0, 16);
    const fp = `${(row.mood || '').trim().toLowerCase()}|${(row.comment || '').trim().toLowerCase()}|${minuteKey}`;
    if (seenFingerprints.has(fp)) return false;
    seenFingerprints.add(fp);
    return true;
  });

  const counts = emptyCounts(keys.length);

  keys.forEach((dateKey, idx) => {
    const dayLogs = uniqueRows.filter((l) => {
      const parsed = parseLogDate(l.created_at);
      if (!parsed) return dateKey === todayKey;
      const localDay = format(parsed, 'yyyy-MM-dd');
      const utcDay = parsed.toISOString().slice(0, 10);
      return localDay === dateKey || (dateKey === todayKey && utcDay === todayKey);
    });

    dayLogs.forEach((l) => {
      const cat = normalizeCategory(l.mood);
      counts[cat][idx] = (counts[cat][idx] || 0) + 1;
    });
  });

  return { keys, labels, counts };
}

async function fetchAllRemoteCheckins(): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  const maxPages = 5;

  while (page <= maxPages) {
    const res = await api.fetchCheckins(page);
    const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    if (items.length === 0) break;
    all.push(...items);

    const lastPage = Number(res?.meta?.last_page ?? 1);
    if (page >= lastPage) break;
    page += 1;
  }

  return all;
}

function computeInsight(data: ChartSeriesData): string {
  const sumArr = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const totalPositive = sumArr(data.counts.positive);
  const totalSad = sumArr(data.counts.sad);
  const totalStressed = sumArr(data.counts.stressed);
  const totalAngry = sumArr(data.counts.angry);
  const totalCalm = sumArr(data.counts.calm);
  const total = totalPositive + totalSad + totalStressed + totalAngry + totalCalm;

  if (total === 0) {
    return 'Tracking your mood over time reveals patterns. Submit a check-in on your dashboard and see them here.';
  }

  const mid = Math.floor(data.labels.length / 2);
  const firstHalf =
    sumArr(data.counts.positive.slice(0, mid)) -
    sumArr(data.counts.sad.slice(0, mid)) -
    sumArr(data.counts.stressed.slice(0, mid));
  const secondHalf =
    sumArr(data.counts.positive.slice(mid)) -
    sumArr(data.counts.sad.slice(mid)) -
    sumArr(data.counts.stressed.slice(mid));

  const positiveRatio = totalPositive / total;

  if (positiveRatio > 0.6) {
    return '😊 You have been mostly positive this period — keep up the great work!';
  }
  if (totalStressed > totalPositive) {
    return '💙 Stress has been prominent. Try the breathing exercise in Wellness Tools.';
  }
  if (secondHalf > firstHalf + 2) {
    return '📈 Your mood is improving — the second half of this period was noticeably better.';
  }
  if (secondHalf < firstHalf - 2) {
    return '📉 Your mood has dipped. Consider a check-in with a counselor or support partner.';
  }
  if (totalSad > totalPositive) {
    return '🌧️ You have had several sad days. You are not alone — reach out to the directory.';
  }
  return '🙂 Your emotions look balanced. Keep logging to spot long-term patterns.';
}

export default function TrackerScreen() {
  const { user } = useAuth();
  const [days, setDays] = useState(7);
  const [series, setSeries] = useState<ChartSeriesData>({
    keys: [],
    labels: [],
    counts: emptyCounts(0),
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isPullToRefresh = false) => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      if (!isPullToRefresh) {
        setLoading(true);
      }

      let local = await db.getAllCheckinsLocal(user.id);
      setSeries(buildSeriesFromCheckins(local, days));
      setLoading(false);

      if (checkOnline()) {
        try {
          await flushPending();
          const remoteItems = await fetchAllRemoteCheckins();
          if (remoteItems.length > 0) {
            await db.mergeRemoteCheckins(user.id, remoteItems);
          }
          local = await db.getAllCheckinsLocal(user.id);
          setSeries(buildSeriesFromCheckins(local, days));
        } catch {
          // Keep local cache when offline or request fails
        }
      }
    },
    [user?.id, days],
  );

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  const allVals = SERIES_CONFIG.flatMap((s) => series.counts[s.key] || []);
  const totalCount = allVals.reduce((a, b) => a + b, 0);
  const maxY = Math.max(1, ...allVals);

  const screenWidth = Dimensions.get('window').width;
  const cardInnerWidth = screenWidth - Spacing.md * 4;
  const yAxisWidth = 26;
  const plotHeight = 200;
  const topPad = 12;
  const bottomPad = 28;
  const canvasHeight = topPad + plotHeight + bottomPad;

  const pointSpacing =
    days === 7
      ? Math.max(44, (cardInnerWidth - yAxisWidth - 24) / Math.max(1, series.labels.length - 1))
      : 42;
  const leftInset = 22;
  const rightInset = 22;
  const plotWidth = Math.max(
    cardInnerWidth - yAxisWidth,
    leftInset + rightInset + Math.max(0, series.labels.length - 1) * pointSpacing,
  );

  const getY = (val: number) => topPad + plotHeight - (val / maxY) * plotHeight;
  const getX = (idx: number) => leftInset + idx * pointSpacing;

  const yTicks = maxY <= 2 ? [maxY, 0] : [maxY, Math.round(maxY / 2), 0];
  const todayKey = format(startOfDay(new Date()), 'yyyy-MM-dd');
  const insightText = computeInsight(series);
  const windowStartLabel = series.labels[0] || '';
  const windowEndLabel = series.labels[series.labels.length - 1] || '';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>📊 Mood Tracker</Text>
        <Text style={styles.subtitle}>See your emotional patterns at a glance.</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff4d8d" />
        }
      >
        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const active = days === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setDays(f)}
                style={[styles.filterBtn, active && styles.filterActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f} Days
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderTop}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="trending-up" size={18} color="#ff4d8d" />
              <Text style={styles.cardTitle}>Your Mood Trends</Text>
            </View>
            {windowStartLabel && windowEndLabel ? (
              <Text style={styles.rangeBadge}>
                {windowStartLabel} – {windowEndLabel}
              </Text>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#ff4d8d" />
              <Text style={styles.loadingText}>Loading chart...</Text>
            </View>
          ) : totalCount === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🌱</Text>
              <Text style={styles.emptyTitle}>No check-ins yet</Text>
              <Text style={styles.emptyDesc}>
                Submit a mood check-in on your dashboard to see your trends here.
              </Text>
            </View>
          ) : (
            <View style={styles.chartOuterRow}>
              {/* Fixed Y-Axis */}
              <View style={{ width: yAxisWidth, height: canvasHeight }}>
                {yTicks.map((tick) => {
                  const y = getY(tick);
                  return (
                    <Text
                      key={tick}
                      style={[styles.yTickLabel, { top: y - 7 }]}
                    >
                      {tick}
                    </Text>
                  );
                })}
              </View>

              {/* Scrollable Plot Area with every day in range */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ width: plotWidth, height: canvasHeight }}>
                  {yTicks.map((tick) => {
                    const y = getY(tick);
                    return (
                      <View
                        key={`grid-${tick}`}
                        style={[
                          styles.gridLine,
                          { top: y, width: plotWidth },
                        ]}
                      />
                    );
                  })}

                  {series.keys.map((key, idx) => {
                    if (key !== todayKey) return null;
                    const x = getX(idx);
                    return (
                      <View
                        key="today-band"
                        style={[
                          styles.todayBand,
                          {
                            left: x - 16,
                            top: topPad,
                            height: plotHeight,
                            width: 32,
                          },
                        ]}
                      />
                    );
                  })}

                  {SERIES_CONFIG.map((s) => {
                    const vals = series.counts[s.key] || [];
                    const pts = vals.map((val, idx) => ({
                      x: getX(idx),
                      y: getY(val),
                      val,
                    }));

                    return (
                      <React.Fragment key={s.key}>
                        {pts.map((p0, idx) => {
                          if (idx >= pts.length - 1) return null;
                          const p1 = pts[idx + 1];
                          const dx = p1.x - p0.x;
                          const dy = p1.y - p0.y;
                          const length = Math.hypot(dx, dy);
                          const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                          const midX = (p0.x + p1.x) / 2;
                          const midY = (p0.y + p1.y) / 2;

                          return (
                            <View
                              key={`seg-${s.key}-${idx}`}
                              style={[
                                styles.lineSegment,
                                {
                                  width: length,
                                  backgroundColor: s.color,
                                  left: midX - length / 2,
                                  top: midY - 1.25,
                                  transform: [{ rotate: `${angleDeg}deg` }],
                                },
                              ]}
                            />
                          );
                        })}

                        {pts.map((pt, idx) => {
                          const size = pt.val > 0 ? 8 : 5;
                          return (
                            <View
                              key={`dot-${s.key}-${idx}`}
                              style={[
                                styles.dataDot,
                                {
                                  width: size,
                                  height: size,
                                  borderRadius: size / 2,
                                  backgroundColor: s.color,
                                  left: pt.x - size / 2,
                                  top: pt.y - size / 2,
                                },
                              ]}
                            />
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  {series.labels.map((label, idx) => {
                    const isToday = series.keys[idx] === todayKey;
                    const x = getX(idx);

                    return (
                      <Text
                        key={series.keys[idx]}
                        style={[
                          styles.xTickLabel,
                          isToday && styles.xTickToday,
                          { left: x - 22, top: topPad + plotHeight + 8 },
                        ]}
                        numberOfLines={1}
                      >
                        {isToday ? 'Today' : label}
                      </Text>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          <View style={styles.legend}>
            {SERIES_CONFIG.map((s) => (
              <View key={s.key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text style={styles.legendText}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.insightCard}>
          <View style={styles.insightIcon}>
            <Ionicons name="bulb" size={18} color="#fff" />
          </View>
          <View style={styles.insightContent}>
            <Text style={styles.insightTitle}>AI Insight</Text>
            <Text style={styles.insightText}>{insightText}</Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <PanicButton />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    paddingBottom: 6,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    paddingBottom: 120,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    alignItems: 'center',
  },
  filterActive: {
    backgroundColor: '#d82b73',
    borderColor: '#ff4d8d',
  },
  filterText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 18,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  rangeBadge: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  loadingBox: {
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  emptyBox: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: {
    fontSize: 42,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyDesc: {
    color: '#94a3b8',
    fontSize: 12.5,
    textAlign: 'center',
    maxWidth: 260,
  },
  chartOuterRow: {
    flexDirection: 'row',
  },
  yTickLabel: {
    position: 'absolute',
    right: 6,
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  todayBand: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 77, 141, 0.08)',
    borderRadius: 6,
  },
  lineSegment: {
    position: 'absolute',
    height: 2.5,
    borderRadius: 1.5,
  },
  dataDot: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#0b1220',
  },
  xTickLabel: {
    position: 'absolute',
    width: 44,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 10,
  },
  xTickToday: {
    color: '#fff',
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '45%',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: '#cbd5f5',
    fontSize: 12,
    fontWeight: '500',
  },
  insightCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  insightIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#d82b73',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  insightText: {
    color: '#94a3b8',
    fontSize: 12.5,
    lineHeight: 18,
  },
});
