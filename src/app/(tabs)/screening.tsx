import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PanicButton } from '@/components/PanicButton';
import { useAuth } from '@/store/authStore';
import * as db from '@/services/db';
import * as api from '@/services/api';
import { checkOnline } from '@/services/network';

const STEPS = [
  {
    title: 'Basic Information',
    subtitle: 'Tell us a bit about yourself and any counselor preferences.',
    fields: [
      { name: 'age', label: 'Age Group', options: ['Under 18', '18-24', '25-34', '35+'] },
      { name: 'gender', label: 'Gender', options: ['Male', 'Female', 'Non-Conforming', 'Other'] },
      { name: 'pronouns', label: 'Pronouns', options: ['He/Him', 'She/Her', 'They/Them', 'MX'] },
      { name: 'orientation', label: 'Orientation', options: ['Heterosexual', 'LGBTIQ', 'Rather Not Say'] },
      { name: 'counselor', label: 'Prefer Similar Counselor?', options: ['Yes', 'No'] },
    ],
  },
  {
    title: 'Mental Health',
    subtitle: 'Share how you have been feeling and coping recently.',
    fields: [
      { name: 'therapist', label: 'Seen a therapist before?', options: ['Yes', 'No'] },
      {
        name: 'concern',
        label: 'Main Concern',
        options: ['Stress', 'Anxiety', 'Depression', 'Identity', 'Family', 'Trauma'],
      },
      { name: 'rating', label: 'Mental Health Rating', options: ['Excellent', 'Good', 'Okay', 'Poor'] },
      { name: 'medication', label: 'On Medication?', options: ['Yes', 'No'] },
    ],
  },
  {
    title: 'Lifestyle',
    subtitle: 'Daily habits and support systems shape your wellbeing.',
    fields: [
      { name: 'support', label: 'Have a trusted person?', options: ['Yes', 'No'] },
      { name: 'substance', label: 'Substance Use', options: ['No', 'Sometimes', 'Often'] },
      { name: 'sleep', label: 'Sleep Duration', options: ['<5 hours', '5-7 hours', '7-9 hours'] },
    ],
  },
  {
    title: 'Safety',
    subtitle: 'Your safety matters. Answer openly so we can guide you.',
    fields: [
      { name: 'selfHarm', label: 'Self-harm thoughts?', options: ['Yes', 'Sometimes', 'No'] },
      { name: 'danger', label: 'In immediate danger?', options: ['Yes', 'No'] },
      { name: 'supportNeed', label: 'Support needed', options: ['Urgent', 'Ongoing', 'Exploring'] },
    ],
  },
];

const REQUIRED_FIELDS: { key: string; label: string; stepIndex: number; fallback: string }[] = [
  { key: 'age', label: 'Age Group', stepIndex: 0, fallback: '25-34' },
  { key: 'gender', label: 'Gender', stepIndex: 0, fallback: 'Other' },
  { key: 'pronouns', label: 'Pronouns', stepIndex: 0, fallback: 'They/Them' },
  { key: 'orientation', label: 'Orientation', stepIndex: 0, fallback: 'Rather Not Say' },
  { key: 'counselor', label: 'Counselor Preference', stepIndex: 0, fallback: 'No' },
  { key: 'therapist', label: 'Therapy History', stepIndex: 1, fallback: 'No' },
  { key: 'concern', label: 'Main Concern', stepIndex: 1, fallback: 'Stress' },
  { key: 'rating', label: 'Mental Health Rating', stepIndex: 1, fallback: 'Okay' },
  { key: 'medication', label: 'Medication', stepIndex: 1, fallback: 'No' },
  { key: 'support', label: 'Trusted Support', stepIndex: 2, fallback: 'Yes' },
  { key: 'substance', label: 'Substance Use', stepIndex: 2, fallback: 'No' },
  { key: 'sleep', label: 'Sleep Duration', stepIndex: 2, fallback: '7-9 hours' },
  { key: 'selfHarm', label: 'Self-harm Thoughts', stepIndex: 3, fallback: 'No' },
  { key: 'danger', label: 'Immediate Danger', stepIndex: 3, fallback: 'No' },
  { key: 'supportNeed', label: 'Support Needed', stepIndex: 3, fallback: 'Ongoing' },
];

const FIELD_TO_DB_KEY: Record<string, string> = {
  age: 'age_group',
  gender: 'gender',
  pronouns: 'pronouns',
  orientation: 'orientation',
  counselor: 'counselor_preference',
  therapist: 'therapist_history',
  concern: 'main_concern',
  rating: 'mental_rating',
  medication: 'medication',
  support: 'support_system',
  substance: 'substance_use',
  sleep: 'sleep',
  selfHarm: 'self_harm',
  danger: 'danger',
  supportNeed: 'support_need',
};

interface CompletionSummary {
  risk: string;
  org: any;
  savedOffline: boolean;
}

interface ScreeningHistoryItem {
  id: string;
  serverId?: number;
  risk_level: string;
  main_concern: string;
  created_at: string;
  isLocalPending?: boolean;
  details?: Record<string, any>;
}

function formatScreeningDate(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return format(d, 'dd MMM yyyy, HH:mm');
}

function mapScreeningToForm(record: Record<string, any>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [formKey, dbKey] of Object.entries(FIELD_TO_DB_KEY)) {
    const val = record[formKey] ?? record[dbKey];
    if (typeof val === 'string' && val.trim().length > 0) {
      next[formKey] = val.trim();
    }
  }
  const ref = record.referral ?? record.preferred_referral;
  if (ref !== undefined && ref !== null && String(ref).trim() !== '') {
    next.referral = String(ref).trim();
  }
  return next;
}

function normalizeScreeningPayload(rawForm: Record<string, string>) {
  const normalized: Record<string, any> = {};
  for (const item of REQUIRED_FIELDS) {
    const val = String(rawForm[item.key] ?? '').trim();
    normalized[item.key] = val.length > 0 ? val : item.fallback;
  }
  normalized.referral =
    rawForm.referral && rawForm.referral !== 'none' && String(rawForm.referral).trim() !== ''
      ? String(rawForm.referral).trim()
      : null;
  return normalized;
}

function getRiskStyle(risk: string) {
  const normalized = String(risk || 'low').toLowerCase();
  if (normalized === 'high') {
    return { color: '#fca5a5', bg: 'rgba(239, 68, 68, 0.18)', border: 'rgba(239, 68, 68, 0.45)' };
  }
  if (normalized === 'medium') {
    return { color: '#fcd34d', bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.45)' };
  }
  return { color: '#86efac', bg: 'rgba(34, 197, 94, 0.18)', border: 'rgba(34, 197, 94, 0.45)' };
}

export default function ScreeningScreen() {
  const { user } = useAuth();
  const [mode, setMode] = useState<'list' | 'wizard'>('list');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completedSummary, setCompletedSummary] = useState<CompletionSummary | null>(null);
  const [history, setHistory] = useState<ScreeningHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedPast, setSelectedPast] = useState<ScreeningHistoryItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const combined: ScreeningHistoryItem[] = [];

    try {
      const unsynced = await db.getUnsyncedScreenings();
      for (const row of unsynced) {
        if (user?.id && row.user_id && Number(row.user_id) !== Number(user.id)) continue;
        let parsed: Record<string, any> = {};
        try {
          parsed = JSON.parse(row.payload || '{}');
        } catch {}
        combined.push({
          id: `local-${row.id}`,
          risk_level: parsed.risk_level || 'low',
          main_concern: parsed.concern || parsed.main_concern || 'General Check',
          created_at: row.created_at,
          isLocalPending: true,
          details: parsed,
        });
      }
    } catch {}

    if (checkOnline()) {
      try {
        const res = await api.fetchScreenings();
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        for (const item of list) {
          combined.push({
            id: `srv-${item.id}`,
            serverId: Number(item.id),
            risk_level: item.risk_level || 'low',
            main_concern: item.main_concern || 'General Check',
            created_at: item.created_at,
            isLocalPending: false,
            details: item,
          });
        }
      } catch {}
    }

    setHistory(combined);
    setLoadingHistory(false);
  }, [user?.id]);

  useEffect(() => {
    db.getCachedOrganizations().then(setOrganizations);
    if (checkOnline()) {
      api
        .fetchOrganizations()
        .then((res) => {
          const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          if (list.length > 0) {
            db.cacheOrganizations(list);
            setOrganizations(list);
          }
        })
        .catch(() => {});
    }
    loadHistory();
  }, [loadHistory]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }

  function startNewScreening() {
    setForm({});
    setStep(0);
    setMode('wizard');
  }

  function backToList() {
    setMode('list');
  }

  async function openPastScreening(item: ScreeningHistoryItem) {
    setSelectedPast(item);
    if (item.serverId && checkOnline()) {
      setLoadingDetail(true);
      try {
        const res = await api.fetchScreening(item.serverId);
        if (res?.data) {
          setSelectedPast({
            ...item,
            details: res.data,
            risk_level: res.data.risk_level || item.risk_level,
            main_concern: res.data.main_concern || item.main_concern,
          });
        }
      } catch {}
      setLoadingDetail(false);
    }
  }

  function replayScreening(item: ScreeningHistoryItem) {
    const mapped = mapScreeningToForm(item.details || {});
    setForm(mapped);
    setStep(0);
    setSelectedPast(null);
    setMode('wizard');
    Toast.show({
      type: 'info',
      text1: 'Replay Started',
      text2: 'Previous responses loaded. Review or update and submit.',
    });
  }

  async function submit() {
    if (!user) {
      Toast.show({
        type: 'error',
        text1: 'Session required',
        text2: 'Please sign in again to save screening.',
      });
      return;
    }

    const missing = REQUIRED_FIELDS.find(
      (f) => !String(form[f.key] ?? '').trim(),
    );
    if (missing) {
      setStep(missing.stepIndex);
      Toast.show({
        type: 'error',
        text1: `Please select ${missing.label}`,
        text2: `Moved to ${STEPS[missing.stepIndex].title} so you can complete it.`,
      });
      return;
    }

    setSubmitting(true);
    const payload = normalizeScreeningPayload(form);

    let risk = 'low';
    if (payload.selfHarm === 'Yes' || payload.danger === 'Yes') risk = 'high';
    else if (
      payload.selfHarm === 'Sometimes' ||
      payload.rating === 'Poor' ||
      payload.support === 'No'
    ) {
      risk = 'medium';
    }

    try {
      if (checkOnline()) {
        const res = await api.pushScreening(payload);
        Toast.show({
          type: 'success',
          text1: 'Screening Completed & Saved',
          text2: 'Your responses have been recorded.',
        });
        setCompletedSummary({
          risk: res?.data?.risk_level || risk,
          org: res?.data?.organization,
          savedOffline: false,
        });
      } else {
        await db.saveScreeningLocal(user.id, { ...payload, risk_level: risk });
        Toast.show({
          type: 'info',
          text1: 'Screening Completed & Saved Offline',
          text2: 'Saved locally and will sync automatically when online.',
        });
        setCompletedSummary({ risk, org: null, savedOffline: true });
      }
      await loadHistory();
      setForm({});
      setStep(0);
      setMode('list');
    } catch (err: any) {
      const serverErrors = err?.response?.data?.errors;
      if (err?.response?.status === 422 && serverErrors) {
        const firstMsg = Object.values(serverErrors).flat()[0];
        Toast.show({
          type: 'error',
          text1: 'Validation Error',
          text2: String(firstMsg || 'Please check all required screening fields.'),
        });
      } else {
        await db.saveScreeningLocal(user.id, { ...payload, risk_level: risk });
        Toast.show({
          type: 'info',
          text1: 'Screening Completed & Saved Offline',
          text2: 'Saved to device storage; will sync when connection is restored.',
        });
        setCompletedSummary({ risk, org: null, savedOffline: true });
        await loadHistory();
        setForm({});
        setStep(0);
        setMode('list');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const answeredInStep = current.fields.filter((f) => !!form[f.name]).length;

  return (
    <>
      <ScreenContainer>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>🧠 Smart Screening</Text>
            <Text style={styles.headerSub}>
              {mode === 'list'
                ? 'Review past screenings or start a new assessment'
                : `Step ${step + 1} of ${STEPS.length} • ${answeredInStep}/${current.fields.length} answered`}
            </Text>
          </View>

          {mode === 'list' ? (
            <TouchableOpacity style={styles.headerStartBtn} onPress={startNewScreening}>
              <Ionicons name="add-circle" size={16} color="#fff" />
              <Text style={styles.headerStartText}>Start Screening</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.headerBackBtn} onPress={backToList}>
              <Ionicons name="list" size={15} color="#fff" />
              <Text style={styles.headerBackText}>History</Text>
            </TouchableOpacity>
          )}
        </View>

        {mode === 'wizard' && (
          <View style={styles.progressBarOuter}>
            <View
              style={[
                styles.progressBarInner,
                { width: `${((step + 1) / STEPS.length) * 100}%` },
              ]}
            />
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#ff4d8d" />
          }
        >
          {mode === 'list' ? (
            <>
              <View style={styles.heroBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>Need a fresh check-in?</Text>
                  <Text style={styles.heroDesc}>
                    Complete a guided 4-step screening or replay a previous one to track changes.
                  </Text>
                </View>
                <TouchableOpacity style={styles.heroCta} onPress={startNewScreening}>
                  <Ionicons name="play" size={16} color="#fff" />
                  <Text style={styles.btnText}>Start New</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.card}>
                <View style={styles.historyHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    Previous Screenings ({history.length})
                  </Text>
                  <TouchableOpacity onPress={loadHistory} style={styles.refreshChip}>
                    <Ionicons name="refresh" size={14} color="#fff" />
                    <Text style={styles.refreshChipText}>Refresh</Text>
                  </TouchableOpacity>
                </View>

                {loadingHistory ? (
                  <ActivityIndicator color={Colors.accentLight} style={{ paddingVertical: 24 }} />
                ) : history.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyEmoji}>📋</Text>
                    <Text style={styles.emptyTitle}>No screenings yet</Text>
                    <Text style={styles.emptyDesc}>
                      Tap Start New Screening above to complete your first self-check.
                    </Text>
                    <TouchableOpacity
                      style={[styles.btnPrimary, { marginTop: Spacing.md, paddingHorizontal: 20 }]}
                      onPress={startNewScreening}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                      <Text style={styles.btnText}>Start Screening</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  history.map((item) => {
                    const riskStyle = getRiskStyle(item.risk_level);
                    return (
                      <View key={item.id} style={styles.historyCard}>
                        <View style={styles.historyTopLine}>
                          <Text style={styles.historyConcern} numberOfLines={1}>
                            {item.main_concern}
                          </Text>
                          <View
                            style={[
                              styles.riskPill,
                              { backgroundColor: riskStyle.bg, borderColor: riskStyle.border },
                            ]}
                          >
                            <Text style={[styles.riskPillText, { color: riskStyle.color }]}>
                              {String(item.risk_level || 'low').toUpperCase()} RISK
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.historyMeta}>
                          {formatScreeningDate(item.created_at)}
                          {item.isLocalPending ? ' • Pending sync' : ''}
                        </Text>

                        <View style={styles.historyActionsRow}>
                          <TouchableOpacity
                            style={styles.actionOutline}
                            onPress={() => openPastScreening(item)}
                          >
                            <Ionicons name="eye-outline" size={14} color="#fff" />
                            <Text style={styles.actionText}>View Details</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionPrimary}
                            onPress={() => replayScreening(item)}
                          >
                            <Ionicons name="refresh-circle-outline" size={15} color="#fff" />
                            <Text style={styles.actionText}>Replay</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <View style={styles.stepPillRow}>
                {STEPS.map((s, idx) => (
                  <TouchableOpacity
                    key={s.title}
                    onPress={() => setStep(idx)}
                    style={[styles.stepDotBtn, idx === step && styles.stepDotBtnActive]}
                  >
                    <Text style={[styles.stepDotText, idx === step && styles.stepDotTextActive]}>
                      {idx + 1}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.stepTitle}>{current.title}</Text>
              <Text style={styles.stepSubtitle}>{current.subtitle}</Text>

              {current.fields.map((f) => (
                <View key={f.name} style={styles.field}>
                  <Text style={styles.label}>{f.label}</Text>
                  <View style={styles.chipRow}>
                    {f.options.map((o) => {
                      const selected = form[f.name] === o;
                      return (
                        <TouchableOpacity
                          key={o}
                          onPress={() => setForm({ ...form, [f.name]: o })}
                          style={[styles.chip, selected && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                            {o}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              {isLast && (
                <View style={styles.field}>
                  <Text style={styles.label}>Preferred Referral</Text>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      onPress={() => setForm({ ...form, referral: 'none' })}
                      style={[styles.chip, form.referral === 'none' && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          form.referral === 'none' && styles.chipTextActive,
                        ]}
                      >
                        No Preference
                      </Text>
                    </TouchableOpacity>
                    {organizations.map((o) => {
                      const isOrgSelected = form.referral === String(o.id);
                      return (
                        <TouchableOpacity
                          key={o.id}
                          onPress={() => setForm({ ...form, referral: String(o.id) })}
                          style={[styles.chip, isOrgSelected && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, isOrgSelected && styles.chipTextActive]}>
                            {o.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={styles.navRow}>
                {step > 0 ? (
                  <TouchableOpacity
                    style={[styles.btnOutline, { flex: 1 }]}
                    onPress={() => setStep(step - 1)}
                    disabled={submitting}
                  >
                    <Ionicons name="arrow-back" size={16} color="#fff" />
                    <Text style={styles.btnText}>Back</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.btnOutline, { flex: 1 }]}
                    onPress={backToList}
                    disabled={submitting}
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                    <Text style={styles.btnText}>Cancel</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.btnPrimary, { flex: 1.4 }]}
                  onPress={() => (isLast ? submit() : setStep(step + 1))}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.btnText}>
                        {isLast ? 'Submit Screening' : 'Next Step'}
                      </Text>
                      {!isLast && <Ionicons name="arrow-forward" size={16} color="#fff" />}
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        <PanicButton />
      </ScreenContainer>

      <Modal
        visible={!!completedSummary}
        transparent
        animationType="fade"
        onRequestClose={() => setCompletedSummary(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <Text style={{ fontSize: 40, textAlign: 'center' }}>✅</Text>
            <Text style={styles.modalTitle}>Screening Complete & Saved</Text>
            <Text style={styles.modalBody}>
              {completedSummary?.savedOffline
                ? 'Your screening responses have been saved offline on your device and will sync automatically when you are back online.'
                : 'Your screening responses have been completed and saved to your account.'}
            </Text>

            {completedSummary?.risk === 'high' && (
              <Text
                style={[
                  styles.modalBody,
                  { color: '#fca5a5', fontWeight: '700', marginTop: 10 },
                ]}
              >
                ⚠️ High risk detected. Please reach out to a trusted person, support partner, or emergency service immediately.
              </Text>
            )}

            {completedSummary?.org && (
              <View style={{ marginTop: Spacing.md }}>
                <Text style={styles.modalTitle}>
                  Recommended: {completedSummary.org.name}
                </Text>
                <Text style={styles.modalBody}>{completedSummary.org.description}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.btnPrimary, { marginTop: Spacing.lg }]}
              onPress={() => setCompletedSummary(null)}
            >
              <Text style={styles.btnText}>View History</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnOutline, { marginTop: Spacing.sm }]}
              onPress={() => {
                setCompletedSummary(null);
                startNewScreening();
              }}
            >
              <Text style={styles.btnText}>Start Another Screening</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedPast}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPast(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Screening Summary</Text>
            <Text style={styles.modalBody}>
              {selectedPast ? formatScreeningDate(selectedPast.created_at) : ''}
            </Text>

            {loadingDetail ? (
              <ActivityIndicator color={Colors.accentLight} style={{ marginVertical: 16 }} />
            ) : selectedPast?.details ? (
              <ScrollView style={{ maxHeight: 280, marginTop: 10 }}>
                <Text style={styles.detailLine}>
                  Risk Level:{' '}
                  <Text style={styles.detailVal}>
                    {String(selectedPast.risk_level || 'low').toUpperCase()}
                  </Text>
                </Text>
                <Text style={styles.detailLine}>
                  Main Concern:{' '}
                  <Text style={styles.detailVal}>{selectedPast.main_concern}</Text>
                </Text>
                {Object.entries(selectedPast.details)
                  .filter(
                    ([k, v]) =>
                      v !== null &&
                      v !== undefined &&
                      v !== '' &&
                      ![
                        'id',
                        'user_id',
                        'created_at',
                        'updated_at',
                        'risk_level',
                        'main_concern',
                      ].includes(k),
                  )
                  .map(([k, v]) => (
                    <Text key={k} style={styles.detailLine}>
                      {k.replace(/_/g, ' ')}:{' '}
                      <Text style={styles.detailVal}>{String(v)}</Text>
                    </Text>
                  ))}
              </ScrollView>
            ) : null}

            {selectedPast && (
              <TouchableOpacity
                style={[styles.btnPrimary, { marginTop: Spacing.md }]}
                onPress={() => replayScreening(selectedPast)}
              >
                <Ionicons name="refresh-circle-outline" size={16} color="#fff" />
                <Text style={styles.btnText}>Replay This Screening</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.btnOutline, { marginTop: Spacing.sm }]}
              onPress={() => setSelectedPast(null)}
            >
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  headerStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.md,
  },
  headerStartText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  headerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  headerBackText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  progressBarOuter: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginHorizontal: Spacing.md,
  },
  progressBarInner: { height: '100%', backgroundColor: Colors.accentLight },
  scrollContent: { padding: Spacing.md, paddingBottom: 120 },
  heroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255, 77, 141, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 141, 0.28)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  heroTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  heroDesc: { color: Colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: Radius.md,
  },
  card: {
    backgroundColor: Colors.glass,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    marginBottom: Spacing.md,
  },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  stepPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
  },
  stepDotBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accentLight,
  },
  stepDotText: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  stepDotTextActive: { color: '#fff' },
  stepTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  stepSubtitle: { color: Colors.textMuted, fontSize: 12.5, marginTop: 3, marginBottom: Spacing.md },
  field: { marginBottom: Spacing.md },
  label: { color: '#e2e8f0', fontSize: 13.5, fontWeight: '700', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textMuted, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  navRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  btnPrimary: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: Radius.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  refreshChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  refreshChipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 28 },
  emptyEmoji: { fontSize: 38, marginBottom: 8 },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptyDesc: { color: Colors.textMuted, fontSize: 12.5, textAlign: 'center', marginTop: 4, maxWidth: 260 },
  historyCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 10,
  },
  historyTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyConcern: { color: '#fff', fontSize: 14.5, fontWeight: '700', flex: 1 },
  riskPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  riskPillText: { fontSize: 10, fontWeight: '800' },
  historyMeta: { color: Colors.textMuted, fontSize: 11.5, marginTop: 4 },
  historyActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  actionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accent,
  },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  detailLine: { color: Colors.textMuted, fontSize: 12.5, marginBottom: 6, textTransform: 'capitalize' },
  detailVal: { color: '#fff', fontWeight: '600' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: { backgroundColor: '#1b2a47', borderRadius: Radius.lg, padding: Spacing.lg },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 6,
  },
  modalBody: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
});