// src/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { api } from './lib/api';

type User = {
  sub: number;
  phone: string;
  name?: string;
  role: 'manager' | 'staff';
  establishment_id: number;
  establishment_name: string;
};

type AuthCtx = {
  user: User | null;
  access: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  requestPin: (phone: string) => Promise<void>;
  loginPin: (phone: string, code: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // попытка поднять сессию по refresh-куке
  const refresh = useCallback(async () => {
    const resp = await api('/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    // ожидаем { access, user }
    setAccess(resp.access);
    setUser(resp.user);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch {
        // нет валидной сессии — ок
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const requestPin = async (phone: string) => {
    await api('/v1/auth/request-pin', {
      method: 'POST',
      body: JSON.stringify({ phone }),
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
  };

  const loginPin = async (phone: string, code: string) => {
    const resp = await api('/v1/auth/login-pin', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // получим httpOnly refresh
    });
    setAccess(resp.access);
    setUser(resp.user);
  };

  const logout = async () => {
    try {
      await api('/v1/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setAccess(null);
      setUser(null);
    }
  };

  // удобные флаги
  const isAuthenticated = !!user && !!access;
  const isAdmin = !!user && user.role === 'manager';

  // мемуизация контекста
  const value = useMemo<AuthCtx>(() => ({
    user,
    access,
    loading,
    isAuthenticated,
    isAdmin,
    requestPin,
    loginPin,
    refresh,
    logout,
  }), [user, access, loading, isAuthenticated, isAdmin, requestPin, loginPin, refresh, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
