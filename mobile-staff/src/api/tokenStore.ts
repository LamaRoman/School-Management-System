import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-secure-store has no web implementation. `expo start --web` is only a developer
// convenience for this app (it ships as an iOS/Android build), so there we fall back to
// AsyncStorage (localStorage) — which is what a browser app would use anyway.
const secure = Platform.OS === 'web'
  ? {
      getItemAsync: (k: string) => AsyncStorage.getItem(k),
      setItemAsync: (k: string, v: string) => AsyncStorage.setItem(k, v),
      deleteItemAsync: (k: string) => AsyncStorage.removeItem(k),
    }
  : SecureStore;

// Access and refresh tokens live in the OS keychain/keystore (expo-secure-store), not
// plain AsyncStorage. The cached user object (email/role/name — not a credential) stays
// in AsyncStorage so the app can open offline.
type TokenKey = 'token' | 'refreshToken';
const USER_KEY = 'user';

export const tokenStore = {
  async get(key: TokenKey): Promise<string | null> {
    const stored = await secure.getItemAsync(key);
    if (stored) return stored;
    if (Platform.OS === 'web') return null; // AsyncStorage *is* the store there
    // One-time migration from the old AsyncStorage location (installs that pre-date this).
    const legacy = await AsyncStorage.getItem(key);
    if (legacy) {
      await secure.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
      return legacy;
    }
    return null;
  },

  async set(key: TokenKey, value: string): Promise<void> {
    await secure.setItemAsync(key, value);
    // Never leave a plaintext copy behind (on web AsyncStorage *is* the store, so skip).
    if (Platform.OS !== 'web') await AsyncStorage.removeItem(key);
  },

  /** Drops the login (both tokens + cached user) from every location. */
  async clear(): Promise<void> {
    await Promise.all([
      secure.deleteItemAsync('token'),
      secure.deleteItemAsync('refreshToken'),
      AsyncStorage.multiRemove(['token', 'refreshToken', USER_KEY]),
    ]);
  },

  async getUser<T>(): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  async setUser(user: unknown): Promise<void> {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  },
};
