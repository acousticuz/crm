import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_KEY,
  api,
} from "./api";

export interface AuthUser {
  sub: string;
  tenantId: string;
  role: string;
  email: string;
  fullName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwt(token: string): AuthUser | null {
  try {
    const [, payload] = token.split(".");
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(json) as {
      sub: string;
      tenantId: string;
      role: string;
      email: string;
    };
    return {
      sub: parsed.sub,
      tenantId: parsed.tenantId,
      role: parsed.role,
      email: parsed.email,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const cached = localStorage.getItem(USER_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as AuthUser;
      } catch {
        return null;
      }
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    return token ? decodeJwt(token) : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ accessToken: string; refreshToken: string }>(
      "/auth/login",
      { email, password },
    );
    localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    const me = await api.get<AuthUser>("/auth/me").then((r) => r.data);
    localStorage.setItem(USER_KEY, JSON.stringify(me));
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  // Keep state in sync if other tabs change localStorage.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === ACCESS_TOKEN_KEY && !e.newValue) {
        setUser(null);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: !!user, login, logout }),
    [user, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
