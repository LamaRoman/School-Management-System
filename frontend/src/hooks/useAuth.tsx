"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "@/lib/api";

interface User {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "TEACHER" | "STUDENT" | "PARENT" | "ACCOUNTANT";
  schoolId?: string | null;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async () => {
    try {
      const fullUser = await api.get<User>("/auth/me");
      setUser(fullUser);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    // No token to check — the HttpOnly cookie is invisible to JS.
    // Just call /auth/me; if the cookie is valid the server responds with
    // the user, otherwise it returns 401 and we stay logged out.
    fetchMe().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    // Server sets the HttpOnly cookie via Set-Cookie header.
    // We ignore the token in the response body (it's there for mobile apps).
    await api.post<{ token: string; user: User }>("/auth/login", { email, password });
    await fetchMe();
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout", {});
    } catch {
      // Server logout failed — continue with local cleanup
    }
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}