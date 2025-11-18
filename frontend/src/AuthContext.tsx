// src/AuthContext.tsx
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, ApiError, setAuthHandlers } from './lib/api';

const PING_INTERVAL_MS = 20_000; // минимальный интервал между пингами при активности



// === Cross-tab auth bus ===
const AUTH_BUS_NAME = 'auth-bus';
const AUTH_STORAGE_KEY = 'auth:lastEvent';

type AuthBusMsgType = 'logout' | 'login' | 'pin_required' | 'unlocked';

type AuthBusMsg = {
  type: AuthBusMsgType;
  ts?: number;
};

type UserPayload = {
  sub: number;
  phone: string;
  name: string | null;
  role: 'manager' | 'staff' | 'solo' | null;
  establishment_id: number | null;
  establishment_name: string | null;
};

type AuthCtx = {
  user: UserPayload | null;
  access: string | null; // для обратной совместимости, всегда null
  loading: boolean;

  // PIN-логика
  needsPin: boolean;
  hasPin: boolean;
  lastPhone: string | null;

  // Состояние серверной сессии
  hasSession: boolean;

  // Можно пускать в приложение?
  isAuthed: boolean;

  // API
  checkSession: (opts?: { silent?: boolean }) => Promise<void>;
  loginPassword: (p: { phone: string; password: string }) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<void>;
  logout: () => Promise<void>;

  // Обратная совместимость
  hydrate: (session: { user: UserPayload; access?: string | null }) => void;
};

export const AuthContext = createContext<AuthCtx>({} as any);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // --- Состояния ---
  const [user, setUser] = useState<UserPayload | null>(null);
  const [access, setAccess] = useState<string | null>(null); // всегда null
  const [loading, setLoading] = useState(true);

  const [needsPin, setNeedsPin] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [lastPhone, setLastPhone] = useState<string | null>(null);

  const [hasSession, setHasSession] = useState(false);

  const busRef = useRef<BroadcastChannel | null>(
    typeof window !== 'undefined' && 'BroadcastChannel' in window
      ? new BroadcastChannel(AUTH_BUS_NAME)
      : null
  );
    // Последняя активность пользователя (клики/клавиатура/скролл)
  const lastActivityRef = useRef<number>(Date.now());
  // Когда последний раз успешно отправляли ping на бэк
  const lastPingRef = useRef<number>(0);


  // === Вспомогательные функции ===

  const reset = useCallback(() => {
    setUser(null);
    setAccess(null);
    setNeedsPin(false);
    setHasPin(false);
    setLastPhone(null);
    setHasSession(false);
  }, []);

  const broadcast = useCallback(
    (type: AuthBusMsgType) => {
      const payload: AuthBusMsg = { type, ts: Date.now() };
      try {
        busRef.current?.postMessage(payload);
      } catch {}
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
      } catch {}
    },
    []
  );

  const hydrate = useCallback((session: { user: UserPayload; access?: string | null }) => {
    setUser(session.user);
    setAccess(null);
    setNeedsPin(false);
    setHasPin(true); // предполагаем, что PIN есть, уточняем в checkSession
    setLastPhone(session.user?.phone ?? null);
    setHasSession(true);
  }, []);


  // Отслеживаем РЕАЛЬНУЮ активность пользователя на фронте
  useEffect(() => {
    const markActive = () => {
      // Если вкладка/окно не видно — не считаем это активностью
      if (document.visibilityState !== 'visible') return;
      lastActivityRef.current = Date.now();
    };

    // Активность: клик, нажатие клавиши, скролл, тач.
    window.addEventListener('click', markActive);
    window.addEventListener('keydown', markActive);
    window.addEventListener('scroll', markActive, true);
    window.addEventListener('touchstart', markActive);

    // mousemove специально НЕ считаем активностью,
    // чтобы "просто водить мышкой" не сбрасывало таймер.
    return () => {
      window.removeEventListener('click', markActive);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('scroll', markActive, true);
      window.removeEventListener('touchstart', markActive);
    };
  }, []);


    // Пинги на бэк:
  //  - НЕ шлём ничего, если пользователь реально бездействует;
  //  - шлём только когда после последнего ping была активность
  //    (клик/скролл/клавиши/тач) и прошло минимум PING_INTERVAL_MS.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!hasSession || needsPin) return;

      const now = Date.now();
      const lastActivity = lastActivityRef.current;
      const lastPing = lastPingRef.current;

      const hadActivitySinceLastPing = lastActivity > lastPing;
      if (!hadActivitySinceLastPing) return;

      if (now - lastPing >= PING_INTERVAL_MS) {
        lastPingRef.current = now;
        void api('/v1/auth/ping', {
          method: 'POST',
        }).catch(() => {
          // 401 / ошибки разрулит api.ts через setAuthHandlers
        });
      }
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [hasSession, needsPin]);




  // === Глобальные хендлеры для api.ts ===
  useEffect(() => {
    setAuthHandlers({
      onPinRequired: () => {
        // Сервер сказал "нужен PIN" (401 PIN_REQUIRED)
        setHasSession(true);
        setNeedsPin(true);
        broadcast('pin_required');
      },
      onSessionExpired: () => {
        // Сессия протухла / удалена
        reset();
        broadcast('logout');
      },
    });
  }, [reset, broadcast]);

  // === checkSession ===
  // /v1/auth/has-session должен:
  // - если сессии нет → { has: false }
  // - если есть → { has: true, phone, has_pin, need_pin }
  const checkSession = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;

      if (!silent) setLoading(true);
      try {
        const r = await api<{
          has: boolean;
          phone: string | null;
          has_pin: boolean;
          need_pin?: boolean;
          user?: UserPayload | null;
        }>('/v1/auth/has-session', { method: 'GET' });

        if (!r.has) {
          reset();
          return;
        }

        setHasSession(true);
        setHasPin(!!r.has_pin);
        setLastPhone(r.phone ?? null);

        if (r.user) {
          setUser(r.user);
        }

        // Если сервер говорит, что нужен PIN — верим серверу
        setNeedsPin(!!r.need_pin && !!r.has_pin);
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 401) {
          if (err.code === 'PIN_REQUIRED') {
            setHasSession(true);
            setNeedsPin(true);
          } else {
            // SESSION_EXPIRED / что угодно ещё
            reset();
          }
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [reset]
  );


  // === cross-tab listeners ===
  useEffect(() => {
    const onMsg = (ev: MessageEvent<AuthBusMsg>) => {
      const msg = ev.data;
      if (!msg?.type) return;

      switch (msg.type) {
        case 'logout':
          reset();
          break;
        case 'pin_required':
          setHasSession(true);
          setNeedsPin(true);
          break;
        case 'unlocked':
          setNeedsPin(false);
          break;
        case 'login':
          void checkSession({ silent: true });
          break;
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key !== AUTH_STORAGE_KEY || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as AuthBusMsg;
        if (!msg?.type) return;
        switch (msg.type) {
          case 'logout':
            reset();
            break;
          case 'pin_required':
            setHasSession(true);
            setNeedsPin(true);
            break;
          case 'unlocked':
            setNeedsPin(false);
            break;
          case 'login':
            void checkSession({ silent: true });
            break;
        }
      } catch {}
    };

    busRef.current?.addEventListener('message', onMsg);
    window.addEventListener('storage', onStorage);

    return () => {
      busRef.current?.removeEventListener('message', onMsg as any);
      window.removeEventListener('storage', onStorage);
    };
  }, [reset, checkSession]);

  // Обновляемся при фокусе / смене видимости окна
  useEffect(() => {
    const tick = () => {
      // Обновляем сессию только когда окно реально активно/видимо
      if (document.visibilityState === 'visible') {
        void checkSession({ silent: true });
      }
    };

    window.addEventListener('focus', tick);
    window.addEventListener('visibilitychange', tick);

    return () => {
      window.removeEventListener('focus', tick);
      window.removeEventListener('visibilitychange', tick);
    };
  }, [checkSession]);

    // Периодический опрос сессии, чтобы оверлей появлялся "по времени", а не только по клику
    useEffect(() => {
      if (!hasSession || needsPin) return;

      // Раз в 30 секунд тихо спрашиваем /has-session
      const intervalMs = 30_000;
      const id = window.setInterval(() => {
        void checkSession({ silent: true });
      }, intervalMs);

      return () => {
        window.clearInterval(id);
      };
    }, [hasSession, needsPin, checkSession]);


  // Первичная проверка
  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // === Операции авторизации ===
  const loginPassword = useCallback(
    async ({ phone, password }: { phone: string; password: string }) => {
      const r = await api<{ user: UserPayload; has_pin?: boolean }>(
        '/v1/auth/login-password',
        {
          method: 'POST',
          body: JSON.stringify({ phone, password }),
        }
      );

      setUser(r.user);
      setAccess(null);
      setHasSession(true);
      setNeedsPin(false); // после логина по паролю PIN не спрашиваем
      setHasPin(r.has_pin ?? true);
      setLastPhone(r.user?.phone ?? null);

      broadcast('login');

      try {
        await checkSession({ silent: true });
      } catch {
        // ignore
      }
    },
    [broadcast, checkSession]
  );



  const unlockWithPin = useCallback(
    async (pin: string) => {
      await api<{ ok: true }>('/v1/auth/unlock', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });

      setNeedsPin(false);
      setHasSession(true);

      broadcast('unlocked');

      try {
        await checkSession({ silent: true });
      } catch {
        // ignore
      }

    },
    [broadcast, checkSession]
  );

  const logout = useCallback(async () => {
    try {
      await api('/v1/auth/logout', { method: 'POST' });
    } catch {
      // игнорируем сетевые ошибки
    }
    reset();
    broadcast('logout');
  }, [reset, broadcast]);

  const value = useMemo<AuthCtx>(() => {
    const isAuthed = hasSession && !needsPin; // пускать внутрь только если сессия есть и PIN не требуется
    return {
      user,
      access,
      loading,

      needsPin,
      hasPin,
      lastPhone,

      hasSession,
      isAuthed,

      checkSession,
      loginPassword,
      unlockWithPin,
      logout,

      hydrate,
    };
  }, [
    user,
    access,
    loading,
    needsPin,
    hasPin,
    lastPhone,
    hasSession,
    checkSession,
    loginPassword,
    unlockWithPin,
    logout,
    hydrate,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
