import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, onAuthExpired } from '../api/client';
import { tokenStore } from '../api/tokenStore';

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

  // The server definitively rejected our refresh token (revoked / expired / account
  // disabled): back to the login screen.
  useEffect(() => onAuthExpired(() => setUser(null)), []);

  useEffect(() => {
    (async () => {
      try {
        const token = await tokenStore.get('token');
        if (token) {
          try {
            const me = await api.get<User>('/auth/me');
            setUser(me);
            await tokenStore.setUser(me);
          } catch {
            // Only a definitive rejection has cleared the tokens by now (see client.ts).
            // If they are still there, we simply couldn't reach the server — open the
            // app from the cached user so a teacher with no signal isn't locked out.
            if (await tokenStore.get('token')) {
              const cached = await tokenStore.getUser<User>();
              if (cached) setUser(cached);
            }
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; refreshToken: string; user: User }>('/auth/login', { email, password });
    await tokenStore.set('token', res.token);
    await tokenStore.set('refreshToken', res.refreshToken);
    const me = await api.get<User>('/auth/me');
    setUser(me);
    await tokenStore.setUser(me);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // Server logout is best-effort — clear local state either way
    }
    await tokenStore.clear();
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