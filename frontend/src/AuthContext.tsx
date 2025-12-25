import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, setAuthHandlers } from './shared/api';




// Добавляем export к типу

export type UserPayload = {

  sub: number;

  phone: string;

  name: string | null;

  role: 'manager' | 'staff' | 'solo' | null;

  establishment_id: number | null;

  establishment_name: string | null;

};



type AuthCtx = {

  user: UserPayload | null;

  loading: boolean;

  lastPhone: string | null;

  hasSession: boolean;

  isAuthed: boolean;

  isCsrfReady: boolean;

  checkSession: (opts?: { silent?: boolean }) => Promise<void>;

  loginPassword: (p: { phone: string; password: string }) => Promise<void>;

  logout: () => Promise<void>;

  hydrate: (session: { user: UserPayload; access?: string }) => void; // ← добавили access?

};



export const AuthContext = createContext<AuthCtx>({} as any);



export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  const [user, setUser] = useState<UserPayload | null>(null);

  const [loading, setLoading] = useState(true);

  const [lastPhone, setLastPhone] = useState<string | null>(null);

  const [hasSession, setHasSession] = useState(false);

  const [isCsrfReady, setIsCsrfReady] = useState(false);

  

  const lastCheckRef = useRef<number>(0);



  const reset = useCallback(() => {

    setUser(null);

    setLastPhone(null);

    setHasSession(false);

  }, []);



  const checkSession = useCallback(async (opts?: { silent?: boolean }) => {

    const now = Date.now();

    if (now - lastCheckRef.current < 1000) return;

    lastCheckRef.current = now;



    const silent = !!opts?.silent;

    if (!silent) setLoading(true);



    try {

      const r = await api<{

        has: boolean;

        phone: string | null;

        user: UserPayload | null;

      }>('/v1/auth/has-session', { method: 'GET' });



      if (!r || !r.has) {

        reset();

        return;

      }



      if (r.user) setUser(r.user);

      setHasSession(true);

      setLastPhone(r.phone ?? r.user?.phone ?? null);

    } catch (err) {

      console.warn('[checkSession] error:', err);

    } finally {

      if (!silent) setLoading(false);

    }

  }, [reset]);



  useEffect(() => {

    // Только CSRF и проверка сессии

    const initializeApp = async () => {

      try {

        await api('/v1/auth/csrf-token', { method: 'GET' });

        setIsCsrfReady(true);

        await checkSession();

      } catch (error) {

        console.error('App initialization error:', error);

        setIsCsrfReady(true);

      } finally {

        setLoading(false);

      }

    };



    void initializeApp();

  }, [checkSession]);



  useEffect(() => {

    setAuthHandlers({

      onSessionExpired: () => {

        reset();

      },

    });

  }, [reset]);



  const loginPassword = useCallback(async ({ phone, password }: { phone: string; password: string }) => {

    if (!isCsrfReady) throw new Error('Система не готова');

    

    const r = await api<{ user: UserPayload }>('/v1/auth/login-password', {

      method: 'POST',

      body: JSON.stringify({ phone, password }),

    });



    setUser(r.user);

    setHasSession(true);

    setLastPhone(r.user?.phone ?? phone);

  }, [isCsrfReady]);



  const logout = useCallback(async () => {

    if (!isCsrfReady) throw new Error('Система не готова');

    

    try {

      await api('/v1/auth/logout', { method: 'POST' });

    } catch {}

    reset();

  }, [reset, isCsrfReady]);



  const hydrate = useCallback((session: { user: UserPayload; access?: string }) => {

    setUser(session.user);

    setLastPhone(session.user?.phone ?? null);

    setHasSession(true);

  }, []);



  const value = useMemo(() => ({

    user,

    loading,

    lastPhone,

    hasSession,

    isAuthed: hasSession,

    isCsrfReady,

    checkSession,

    loginPassword,

    logout,

    hydrate,

  }), [

    user, loading, lastPhone, hasSession, isCsrfReady,

    checkSession, loginPassword, logout, hydrate

  ]);



  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

};