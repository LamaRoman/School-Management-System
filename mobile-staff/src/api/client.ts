import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Reads from app.config.js → extra.apiUrl, which is set per EAS build profile.
// Fallback to local dev server (no /api prefix — backend routes are at root).
const API_BASE = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:4000';
const client = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request
client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Refresh-token interceptor ───────────────────────────
// On 401, try to refresh once. Deduplicates concurrent calls so only
// one refresh request fires; all queued requests replay after it resolves.
let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const refreshToken = await AsyncStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
    const newToken: string = data?.data?.token;
    const newRefresh: string = data?.data?.refreshToken;
    if (!newToken || !newRefresh) return null;

    await AsyncStorage.setItem('token', newToken);
    await AsyncStorage.setItem('refreshToken', newRefresh);
    return newToken;
  } catch {
    return null;
  }
}

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // Don't retry refresh calls themselves, or already-retried requests
    if (
      err.response?.status === 401 &&
      !original._retried &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retried = true;

      // Deduplicate: reuse in-flight refresh promise
      if (!refreshPromise) {
        refreshPromise = tryRefresh().finally(() => { refreshPromise = null; });
      }

      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return client(original);
      }

      // Refresh failed — clear everything
      await AsyncStorage.multiRemove(['token', 'refreshToken', 'user']);
    }

    return Promise.reject(err);
  }
);

export const api = {
  get: <T>(path: string, params?: Record<string, any>) =>
    client.get<{ data: T }>(path, { params }).then((r) => r.data.data),

  post: <T>(path: string, body?: any) =>
    client.post<{ data: T }>(path, body).then((r) => r.data.data),

  put: <T>(path: string, body?: any) =>
    client.put<{ data: T }>(path, body).then((r) => r.data.data),

  delete: <T>(path: string) =>
    client.delete<{ data: T }>(path).then((r) => r.data.data),
};

export const getErrorMessage = (err: any): string => {
  return err?.response?.data?.error || err?.message || 'Something went wrong';
};