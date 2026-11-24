import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '@/services/api';

const USER_KEY = 'oh_auth_user';

export interface AuthUser {
  id: number | string;
  name?: string;
  username?: string;
  email?: string;
  isGuest?: boolean;
  [key: string]: any;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  loading: boolean;
  initialized: boolean;
  hydrate: () => Promise<void>;
  initAuth: () => Promise<void>;
  login: (
    usernameOrCredentials: string | { username?: string; email?: string; password: string },
    password?: string,
  ) => Promise<AuthUser | null>;
  guest: () => Promise<AuthUser>;
  register: (payload: Record<string, any>) => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  forceLogout: () => Promise<void>;
  setUser: (user: AuthUser | null) => Promise<void>;
}

function extractUser(res: any, fallbackName?: string): AuthUser | null {
  const candidate = res?.user || res?.data?.user || res?.data || null;
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate;
  }
  if (fallbackName) {
    return {
      id: Date.now(),
      name: fallbackName,
      username: fallbackName,
    };
  }
  return null;
}

export const useAuth = create<AuthState>((set, get) => {
  const runHydrate = async () => {
    set({ isLoading: true, loading: true });
    try {
      const token = await api.getAuthToken();
      const rawUser = await AsyncStorage.getItem(USER_KEY);
      const parsedUser = rawUser ? JSON.parse(rawUser) : null;

      if (token) {
        set({ token, user: parsedUser });
        try {
          const meRes = await api.fetchMe();
          const freshUser = extractUser(meRes);
          if (freshUser) {
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(freshUser));
            set({ user: freshUser });
          }
        } catch {}
      } else {
        set({ token: null, user: parsedUser });
      }
    } catch {
      set({ token: null, user: null });
    } finally {
      set({ isLoading: false, loading: false, initialized: true });
    }
  };

  return {
    user: null,
    token: null,
    isLoading: true,
    loading: true,
    initialized: false,

    hydrate: runHydrate,
    initAuth: runHydrate,

    login: async (usernameOrCredentials, password) => {
      set({ isLoading: true, loading: true });
      try {
        const creds =
          typeof usernameOrCredentials === 'string'
            ? {
                username: usernameOrCredentials,
                email: usernameOrCredentials,
                password: password || '',
              }
            : usernameOrCredentials;

        const res = await api.login(creds);
        const token =
          res?.token ||
          res?.data?.token ||
          res?.access_token ||
          (await api.getAuthToken());
        const userObj = extractUser(res, creds.username || creds.email);
        if (userObj) {
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(userObj));
        }
        set({ token, user: userObj });
        return userObj;
      } finally {
        set({ isLoading: false, loading: false });
      }
    },

    guest: async () => {
      set({ isLoading: true, loading: true });
      try {
        const res = await api.guestLogin();
        const token =
          res?.token ||
          res?.data?.token ||
          res?.access_token ||
          (await api.getAuthToken());
        const userObj = extractUser(res, 'Guest User') || {
          id: 'guest',
          name: 'Guest User',
          username: 'guest',
          isGuest: true,
        };
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(userObj));
        set({ token, user: userObj });
        return userObj;
      } catch {
        const fallbackGuest: AuthUser = {
          id: 'guest',
          name: 'Guest User',
          username: 'guest',
          isGuest: true,
        };
        await api.setAuthToken(null);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(fallbackGuest));
        set({ user: fallbackGuest, token: null });
        return fallbackGuest;
      } finally {
        set({ isLoading: false, loading: false });
      }
    },

    register: async (payload) => {
      set({ isLoading: true, loading: true });
      try {
        const res = await api.register(payload);
        const token =
          res?.token ||
          res?.data?.token ||
          res?.access_token ||
          (await api.getAuthToken());
        const userObj = extractUser(res, payload?.name || payload?.username || payload?.email);
        if (userObj) {
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(userObj));
        }
        set({ token, user: userObj });
        return userObj;
      } finally {
        set({ isLoading: false, loading: false });
      }
    },

    logout: async () => {
      set({ isLoading: true, loading: true });
      try {
        await api.logout();
      } catch {}
      await AsyncStorage.removeItem(USER_KEY);
      set({ user: null, token: null, isLoading: false, loading: false });
    },

    forceLogout: async () => {
      if (!get().token && !get().user) return;
      try {
        await api.setAuthToken(null);
        await AsyncStorage.removeItem(USER_KEY);
      } catch {}
      set({ user: null, token: null });
    },

    setUser: async (user) => {
      if (user) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
      } else {
        await AsyncStorage.removeItem(USER_KEY);
      }
      set({ user });
    },
  };
});

if (typeof api.setUnauthorizedHandler === 'function') {
  api.setUnauthorizedHandler(() => {
    try {
      useAuth.getState().forceLogout();
    } catch {}
  });
}

export default useAuth;