import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'oh_token';
const USER_KEY = 'oh_user';

export const secure = {
  async getToken(): Promise<string | null> {
    try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; }
  },
  async setToken(t: string) { await SecureStore.setItemAsync(TOKEN_KEY, t); },
  async clearToken() { await SecureStore.deleteItemAsync(TOKEN_KEY); },
};

export const prefs = {
  async getUser<T>(): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  async setUser(u: any) { await AsyncStorage.setItem(USER_KEY, JSON.stringify(u)); },
  async clearUser() { await AsyncStorage.removeItem(USER_KEY); },
};