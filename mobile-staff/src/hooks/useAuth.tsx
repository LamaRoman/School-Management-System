import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getErrorMessage } from '../api/client';

interface User {
  id: string;
  email: string;
  role: 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT' | 'ACCOUNTANT';
  student?: { id: string; name: string } | null;
  teacher?: { id: string; name: string } | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const me = await api.get<User>('/auth/me');
          setUser(me);
        }
      } catch {
        await AsyncStorage.multiRemove(['token', 'refreshToken', 'user']);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; refreshToken: string; user: User }>('/auth/login', { email, password });
    await AsyncStorage.setItem('token', res.token);
    await AsyncStorage.setItem('refreshToken', res.refreshToken);
    const me = await api.get<User>('/auth/me');
    setUser(me);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // Server logout is best-effort — clear local state either way
    }
    await AsyncStorage.multiRemove(['token', 'refreshToken', 'user']);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}