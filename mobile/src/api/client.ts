import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Change this to your backend IP when testing on a physical device
// e.g. 'http://192.168.1.100:4000/api'
// For Expo Go on simulator: 'http://localhost:4000/api'
const API_BASE = 'http://192.168.1.65:4000/api';
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

// Handle 401 globally
client.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
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
