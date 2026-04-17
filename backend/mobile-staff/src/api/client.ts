import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_BASE = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:4000';
const client = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Track whether a refresh is in progress to avoid duplicate calls
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

// Handle 401 — attempt silent refresh before giving up
client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;
    if (err.response?.status === 401 && !originalRequest._retry) {
      // Don't retry the refresh endpoint itself
      if (originalRequest.url?.includes('/auth/refresh')) {
        await AsyncStorage.multiRemove(['token', 'refreshToken', 'user']);
        return Promise.reject(err);
      }

      if (isRefreshing) {
        // Another request is already refreshing — queue this one
        return new Promise((resolve) => {
          addRefreshSubscriber((newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(client(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
        const { token: newToken, refreshToken: newRefreshToken } = res.data.data;

        await AsyncStorage.setItem('token', newToken);
        await AsyncStorage.setItem('refreshToken', newRefreshToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        onRefreshed(newToken);
        return client(originalRequest);
      } catch {
        await AsyncStorage.multiRemove(['token', 'refreshToken', 'user']);
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
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
  return err?.response?.data?.error || err?.message || 'Something went wrong';
};
