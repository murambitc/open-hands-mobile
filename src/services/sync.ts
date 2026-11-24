import { AppState, AppStateStatus } from 'react-native';
import * as db from './db';
import * as api from './api';
import { checkOnline } from './network';

export interface SyncListenerState {
  pendingCount: number;
  isSyncing: boolean;
}

type SyncListener = (state: SyncListenerState) => void;

const SCREENING_DEFAULTS: Record<string, string> = {
  age: '25-34',
  gender: 'Other',
  pronouns: 'They/Them',
  orientation: 'Rather Not Say',
  counselor: 'No',
  therapist: 'No',
  concern: 'Stress',
  rating: 'Okay',
  medication: 'No',
  support: 'Yes',
  substance: 'No',
  sleep: '7-9 hours',
  selfHarm: 'No',
  danger: 'No',
  supportNeed: 'Ongoing',
};

function sanitizeScreeningPayload(raw: any): Record<string, any> {
  const src = raw && typeof raw === 'object' ? raw : {};
  const clean: Record<string, any> = {};

  for (const [key, fallback] of Object.entries(SCREENING_DEFAULTS)) {
    const val = String(src[key] ?? '').trim();
    clean[key] = val.length > 0 ? val : fallback;
  }

  clean.referral =
    src.referral && src.referral !== 'none' && String(src.referral).trim() !== ''
      ? String(src.referral).trim()
      : null;

  return clean;
}

function sanitizeCheckinPayload(checkinRow: any, parsed: any): { mood: string; comment: string } {
  const rawMood = String(parsed?.mood ?? checkinRow?.mood ?? '').trim();
  const mood = rawMood.length > 0 ? rawMood.slice(0, 60) : 'Calm';

  const rawComment = String(parsed?.comment ?? checkinRow?.comment ?? '').trim();
  const comment = (rawComment.length > 0 ? rawComment : `${mood} check-in`).slice(0, 500);

  return { mood, comment };
}

async function resolveSyncedRow(
  rowId: number | string,
  markFnName: string,
  deleteFnName: string,
  extraArg?: any,
) {
  const dbAny = db as Record<string, any>;
  if (typeof dbAny[markFnName] === 'function') {
    await dbAny[markFnName](rowId, extraArg);
  } else if (typeof dbAny[deleteFnName] === 'function') {
    await dbAny[deleteFnName](rowId);
  }
}

let isSyncing = false;
let pendingCount = 0;
const listeners = new Set<SyncListener>();

function emitSyncState() {
  const snapshot: SyncListenerState = { pendingCount, isSyncing };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {}
  });
}

async function refreshPendingCount(): Promise<number> {
  let count = 0;
  const dbAny = db as Record<string, any>;

  try {
    if (typeof dbAny.getUnsyncedScreenings === 'function') {
      const screenings = await dbAny.getUnsyncedScreenings();
      count += Array.isArray(screenings) ? screenings.length : 0;
    }
  } catch {}

  try {
    if (typeof dbAny.getUnsyncedAlerts === 'function') {
      const alerts = await dbAny.getUnsyncedAlerts();
      count += Array.isArray(alerts) ? alerts.length : 0;
    }
  } catch {}

  try {
    if (typeof dbAny.getUnsyncedCheckins === 'function') {
      const checkins = await dbAny.getUnsyncedCheckins();
      count += Array.isArray(checkins) ? checkins.length : 0;
    }
  } catch {}

  pendingCount = count;
  emitSyncState();
  return count;
}

export function getSyncState(): SyncListenerState {
  return { pendingCount, isSyncing };
}

export function subscribeSync(listener: SyncListener): () => void {
  listeners.add(listener);
  refreshPendingCount().catch(() => emitSyncState());
  return () => {
    listeners.delete(listener);
  };
}

export async function syncPendingData(): Promise<{
  syncedScreenings: number;
  syncedAlerts: number;
  syncedCheckins: number;
}> {
  const summary = {
    syncedScreenings: 0,
    syncedAlerts: 0,
    syncedCheckins: 0,
  };

  await refreshPendingCount();

  if (isSyncing) return summary;

  const online = await checkOnline();
  if (!online) return summary;

  const token = typeof api.getAuthToken === 'function' ? await api.getAuthToken() : null;
  if (!token) {
    return summary;
  }

  isSyncing = true;
  emitSyncState();

  const dbAny = db as Record<string, any>;

  try {
    // 1. Sync pending screenings
    if (typeof dbAny.getUnsyncedScreenings === 'function') {
      const unsyncedScreenings = await dbAny.getUnsyncedScreenings();
      for (const row of unsyncedScreenings) {
        try {
          let parsed: any = {};
          try {
            parsed = row.payload ? JSON.parse(row.payload) : {};
          } catch {
            parsed = {};
          }

          const cleanPayload = sanitizeScreeningPayload(parsed);
          await api.pushScreening(cleanPayload);
          await resolveSyncedRow(row.id, 'markScreeningSynced', 'deleteUnsyncedScreening');
          summary.syncedScreenings += 1;
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401) {
            break;
          }
          console.warn(`screening sync failed ${row.id}`, {
            status,
            message: err?.message,
            data: err?.response?.data,
          });

          if (status === 422) {
            await resolveSyncedRow(row.id, 'markScreeningSynced', 'deleteUnsyncedScreening');
          }
        }
      }
    }

    // 2. Sync pending emergency alerts
    if (
      typeof dbAny.getUnsyncedAlerts === 'function' &&
      typeof api.sendEmergencyAlert === 'function'
    ) {
      const unsyncedAlerts = await dbAny.getUnsyncedAlerts();
      for (const alertRow of unsyncedAlerts) {
        try {
          let parsed: any = {};
          try {
            parsed = alertRow.payload ? JSON.parse(alertRow.payload) : alertRow;
          } catch {
            parsed = alertRow;
          }

          await api.sendEmergencyAlert(parsed);
          await resolveSyncedRow(alertRow.id, 'markAlertSynced', 'deleteUnsyncedAlert');
          summary.syncedAlerts += 1;
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401) {
            break;
          }
          console.warn(`alert sync failed ${alertRow.id}`, {
            status,
            message: err?.message,
          });

          if (status === 422) {
            await resolveSyncedRow(alertRow.id, 'markAlertSynced', 'deleteUnsyncedAlert');
          }
        }
      }
    }

    // 3. Sync pending check-ins
    if (
      typeof dbAny.getUnsyncedCheckins === 'function' &&
      typeof api.pushCheckin === 'function'
    ) {
      const unsyncedCheckins = await dbAny.getUnsyncedCheckins();
      for (const checkinRow of unsyncedCheckins) {
        try {
          let parsed: any = {};
          try {
            parsed = checkinRow.payload ? JSON.parse(checkinRow.payload) : checkinRow;
          } catch {
            parsed = checkinRow;
          }

          const { mood, comment } = sanitizeCheckinPayload(checkinRow, parsed);
          const res = await (api.pushCheckin as any)(mood, comment);
          const serverId = Number(res?.data?.id ?? res?.id ?? 0);

          await resolveSyncedRow(
            checkinRow.id,
            'markCheckinSynced',
            'deleteUnsyncedCheckin',
            serverId,
          );
          summary.syncedCheckins += 1;
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401) {
            break;
          }
          console.warn(`checkin sync failed ${checkinRow.id}`, {
            status,
            message: err?.message,
            data: err?.response?.data,
          });

          if (status === 422) {
            await resolveSyncedRow(checkinRow.id, 'markCheckinSynced', 'deleteUnsyncedCheckin');
          }
        }
      }
    }
  } finally {
    isSyncing = false;
    await refreshPendingCount();
  }

  return summary;
}

export async function flushPending() {
  return syncPendingData();
}

export function startAutoSync(intervalMs = 30000): () => void {
  syncPendingData().catch(() => {});

  const timer = setInterval(() => {
    syncPendingData().catch(() => {});
  }, intervalMs);

  const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      syncPendingData().catch(() => {});
    }
  });

  return () => {
    clearInterval(timer);
    subscription.remove();
  };
}

export default {
  syncPendingData,
  flushPending,
  startAutoSync,
  subscribeSync,
  getSyncState,
};