// src/AuthContext.tsx
import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './lib/api';

type UserPayload = {
  sub: number;
  phone: string;
  name: string | null;
  role: 'manager' | 'staff' | null;
  establishment_id: number | null;
  establishment_name: string | null;
};

type AuthCtx = {
  user: UserPayload | null;
  access: string | null;
  loading: boolean;
  needsPin: boolean;
  lastPhone: string | null;

  checkRefreshPresence: () => Promise<void>;
  loginPassword: (p: { phone: string; password: string; pin?: string }) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthCtx>({} as any);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [access, setAccess] = useState<string | null>(null);
  const [user, setUser] = useState<UserPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPin, setNeedsPin] = useState(false);
  const [lastPhone, setLastPhone] = useState<string | null>(null);

  const reset = () => {
    setAccess(null);
    setUser(null);
    setNeedsPin(false);
  };

  const checkRefreshPresence = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ has: boolean; phone: string | null }>('/v1/auth/has-refresh', { method: 'GET' });
      setNeedsPin(Boolean(r.has));
      setLastPhone(r.phone || null);
    } catch {
      setNeedsPin(false);
      setLastPhone(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loginPassword = useCallback(async ({ phone, password, pin }: { phone: string; password: string; pin?: string; }) => {
    const r = await api<{ access: string; user: UserPayload }>('/v1/auth/login-password', {
      method: 'POST',
      body: JSON.stringify({ phone, password, pin }),
    });
    setAccess(r.access);
    setUser(r.user);
    setNeedsPin(false);
    setLastPhone(r.user?.phone || null);
  }, []);

  const unlockWithPin = useCallback(async (pin: string) => {
    const r = await api<{ access: string; user: UserPayload }>('/v1/auth/unlock', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
    setAccess(r.access);
    setUser(r.user);
    setNeedsPin(false);
    setLastPhone(r.user?.phone || null);
  }, []);

  const refresh = useCallback(async () => {
    const r = await api<{ access: string; user: UserPayload }>('/v1/auth/refresh', { method: 'POST' });
    setAccess(r.access);
    setUser(r.user);
    setLastPhone(r.user?.phone || null);
  }, []);

  const logout = useCallback(async () => {
    try { await api('/v1/auth/logout', { method: 'POST' }); } catch {}
    reset();
  }, []);

  useEffect(() => { checkRefreshPresence(); }, [checkRefreshPresence]);

  const value = useMemo<AuthCtx>(() => ({
    user, access, loading, needsPin, lastPhone,
    checkRefreshPresence, loginPassword, unlockWithPin, refresh, logout,
  }), [user, access, loading, needsPin, lastPhone, checkRefreshPresence, loginPassword, unlockWithPin, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
