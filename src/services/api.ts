import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'oh_auth_token';

function normalizeApiV1BaseUrl(rawUrl?: string): string {
  const fallback = 'https://openhands.co.bw/api/v1';
  const trimmed = (rawUrl || fallback).trim().replace(/\/+$/, '');
  if (!trimmed) return fallback;
  if (trimmed.endsWith('/api/v1')) return trimmed;
  if (trimmed.endsWith('/api')) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

const DEFAULT_BASE_URL = normalizeApiV1BaseUrl(process.env.EXPO_PUBLIC_API_URL);

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let inMemoryToken: string | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

const instance = axios.create({
  baseURL: DEFAULT_BASE_URL,
  timeout: 20000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

export async function setAuthToken(token: string | null): Promise<void> {
  inMemoryToken = token;
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export async function getAuthToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  const stored = await AsyncStorage.getItem(TOKEN_KEY);
  inMemoryToken = stored;
  return stored;
}

function extractToken(data: any): string | null {
  return (
    data?.token ||
    data?.data?.token ||
    data?.access_token ||
    data?.data?.access_token ||
    null
  );
}

instance.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

instance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      inMemoryToken = null;
      await AsyncStorage.removeItem(TOKEN_KEY);
      if (typeof unauthorizedHandler === 'function') {
        try {
          unauthorizedHandler();
        } catch {}
      }
    }
    return Promise.reject(error);
  },
);

/* ================================================================
   AUTH (/v1/auth/*)
   ================================================================ */
export async function login(credentials: {
  username?: string;
  email?: string;
  password: string;
}) {
  const identifier = (credentials.email ?? credentials.username ?? '').trim();
  const payload = {
    email: identifier,
    username: identifier,
    password: credentials.password,
  };

  const { data } = await instance.post('/auth/login', payload);
  const token = extractToken(data);
  if (token) {
    await setAuthToken(token);
  }
  return data;
}

export async function register(payload: Record<string, any>) {
  const { data } = await instance.post('/auth/register', payload);
  const token = extractToken(data);
  if (token) {
    await setAuthToken(token);
  }
  return data;
}

export async function guestLogin(payload: Record<string, any> = {}) {
  const { data } = await instance.post('/auth/guest', payload);
  const token = extractToken(data);
  if (token) {
    await setAuthToken(token);
  }
  return data;
}

export async function logout() {
  try {
    await instance.post('/auth/logout');
  } finally {
    await setAuthToken(null);
  }
}

export async function fetchMe() {
  const { data } = await instance.get('/auth/me');
  return data;
}

export async function refreshToken() {
  const { data } = await instance.post('/auth/refresh');
  const token = extractToken(data);
  if (token) {
    await setAuthToken(token);
  }
  return data;
}

/* ================================================================
   PUBLIC READ-ONLY (/v1/settings, /v1/organizations, /v1/sessions)
   ================================================================ */
export async function fetchSettings(params?: Record<string, any>) {
  const { data } = await instance.get('/settings', { params });
  return data;
}

export async function fetchOrganizations(params?: Record<string, any>) {
  const { data } = await instance.get('/organizations', { params });
  return data;
}

export async function fetchOrganization(id: number | string) {
  const { data } = await instance.get(`/organizations/${id}`);
  return data;
}

export async function fetchSessions(params?: Record<string, any>) {
  const { data } = await instance.get('/sessions', { params });
  return data;
}

export async function fetchSession(id: number | string) {
  const { data } = await instance.get(`/sessions/${id}`);
  return data;
}

/* ================================================================
   DASHBOARD, CHECK-INS & CHART
   ================================================================ */
export async function fetchDashboard() {
  const { data } = await instance.get('/dashboard');
  return data;
}

export async function fetchCheckins(page = 1, params?: Record<string, any>) {
  const { data } = await instance.get('/checkins', {
    params: { page, ...(params || {}) },
  });
  return data;
}

export async function pushCheckin(
  moodOrPayload: string | Record<string, any>,
  comment?: string,
) {
  const payload =
    typeof moodOrPayload === 'string'
      ? {
          mood: String(moodOrPayload || 'Calm').trim() || 'Calm',
          comment:
            String(comment || `${moodOrPayload || 'Calm'} check-in`).trim() ||
            'Mood check-in',
        }
      : {
          ...moodOrPayload,
          mood: String(moodOrPayload?.mood || 'Calm').trim() || 'Calm',
          comment:
            String(
              moodOrPayload?.comment || `${moodOrPayload?.mood || 'Calm'} check-in`,
            ).trim() || 'Mood check-in',
        };
  const { data } = await instance.post('/checkins', payload);
  return data;
}

export async function deleteCheckin(id: number | string) {
  const { data } = await instance.delete(`/checkins/${id}`);
  return data;
}

export async function fetchCheckinsChart(days = 7) {
  const { data } = await instance.get('/checkins/chart', { params: { days } });
  return data;
}

/* ================================================================
   SCREENINGS
   ================================================================ */
export async function fetchScreenings(params?: Record<string, any>) {
  const { data } = await instance.get('/screenings', { params });
  return data;
}

export async function fetchScreening(id: number | string) {
  const { data } = await instance.get(`/screenings/${id}`);
  return data;
}

export async function pushScreening(payload: Record<string, any>) {
  const { data } = await instance.post('/screenings', payload);
  return data;
}

/* ================================================================
   PANIC & CHAT
   ================================================================ */
export async function sendEmergencyAlert(payload: Record<string, any> = {}) {
  const { data } = await instance.post('/panic', payload);
  return data;
}

export async function fetchPanicHistory() {
  const { data } = await instance.get('/panic/history');
  return data;
}

export async function fetchChat(params?: Record<string, any>) {
  const { data } = await instance.get('/chat', { params });
  return data;
}

export async function sendChatMessage(payload: Record<string, any>) {
  const { data } = await instance.post('/chat', payload);
  return data;
}

export default instance;