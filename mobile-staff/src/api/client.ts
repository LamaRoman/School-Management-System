import axios from 'axios';
import Constants from 'expo-constants';
import { tokenStore } from './tokenStore';
import { classifyRefreshError, isNetworkError } from './refreshOutcome';

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
  const token = await tokenStore.get('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Session expiry ──────────────────────────────────────
// Fired only when the server definitively rejects the refresh token, so the UI can
// return to the login screen instead of sitting on screens whose requests all fail.
const authExpiredListeners = new Set<() => void>();
export function onAuthExpired(cb: () => void): () => void {
  authExpiredListeners.add(cb);
  return () => { authExpiredListeners.delete(cb); };
}

// ─── Refresh-token interceptor ───────────────────────────
// On 401, try to refresh once. Deduplicates concurrent calls so only
// one refresh request fires; all queued requests replay after it resolves.
type RefreshResult = { outcome: 'ok'; token: string } | { outcome: 'rejected' | 'unavailable' };
let refreshPromise: Promise<RefreshResult> | null = null;

async function tryRefresh(): Promise<RefreshResult> {
  const refreshToken = await tokenStore.get('refreshToken');
  if (!refreshToken) return { outcome: 'rejected' };

  try {
    const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken }, { timeout: 15000 });
    const newToken: string = data?.data?.token;
    const newRefresh: string = data?.data?.refreshToken;
    if (!newToken || !newRefresh) return { outcome: 'unavailable' };

    // Persist the NEW refresh token before anything else: the server has already
    // rotated, so the old one is only good for a short grace window.
    await tokenStore.set('refreshToken', newRefresh);
    await tokenStore.set('token', newToken);
    return { outcome: 'ok', token: newToken };
  } catch (e) {
    return { outcome: classifyRefreshError(e) };
  }
}

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // Don't retry refresh calls themselves, or already-retried requests
    if (
      err.response?.status === 401 &&
      original &&
      !original._retried &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retried = true;

      // Deduplicate: reuse in-flight refresh promise
      if (!refreshPromise) {
        refreshPromise = tryRefresh().finally(() => { refreshPromise = null; });
      }

      const result = await refreshPromise;
      if (result.outcome === 'ok') {
        original.headers.Authorization = `Bearer ${result.token}`;
        return client(original);
      }

      if (result.outcome === 'rejected') {
        // Definitive: the session is over.
        await tokenStore.clear();
        authExpiredListeners.forEach((cb) => cb());
      } else {
        // Couldn't reach the server to refresh. Keep the login; surface this as a
        // connectivity problem rather than "unauthorised".
        err.isRefreshUnavailable = true;
      }
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
  if (isNetworkError(err)) return "Can't reach the server. Check your connection and try again.";
  return err?.response?.data?.error || err?.message || 'Something went wrong';
};