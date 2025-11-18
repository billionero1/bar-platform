// src/pages/LoginPin.tsx
// Глобальный PIN-оверлей, а не отдельная страница
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AuthContext } from '../AuthContext';
import PinPad from '../components/PinPad';
import { rusify } from '../lib/errors';
import { formatPhone } from '../lib/phone';

const getGreeting = () => {
  const hours = new Date().getHours();
  if (hours < 5) return 'Доброй ночи,';
  if (hours < 12) return 'Доброе утро,';
  if (hours < 18) return 'Добрый день,';
  return 'Добрый вечер,';
};

// Сколько всего НЕВЕРНЫХ попыток до блокировки
// (1-я ошибка + ещё 3 попытки = 4 ошибки всего)
const MAX_ATTEMPTS = 4;
const LOCK_SECONDS = 1 * 60; // 30 минут блокировки

// ключи для "привязки" к устройству
const STORAGE_ATTEMPTS_KEY = 'pin_attempts_left';
const STORAGE_LOCK_UNTIL_KEY = 'pin_lock_until';

const formatAttemptsWord = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'попытка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'попытки';
  return 'попыток';
};

const formatTime = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const LoginPinOverlay: React.FC = () => {
  const {
    unlockWithPin,
    logout,
    needsPin,
    hasPin,
    hasSession,
    user,
    lastPhone,
  } = useContext(AuthContext);

  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  // сколько попыток осталось до блокировки (4 → 3 → 2 → 1 → блок)
  const [attemptsLeft, setAttemptsLeft] = useState<number>(MAX_ATTEMPTS);

  const [locked, setLocked] = useState(false);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockRemaining, setLockRemaining] = useState(0); // секунд до конца блокировки

  // защита от повторной отправки одной и той же комбинации
  const submittedRef = useRef(false);

  const greeting = getGreeting();

  // Реальные данные пользователя
  const userName = (user?.name && user.name.trim()) || 'Имя';

  const rawPhone =
    (user?.phone && user.phone.trim()) ||
    (lastPhone || '').trim();

  // формат рендера: +7 (925) 975 34 61
  const userPhone = rawPhone ? formatPhone(rawPhone) : '+7';

  const initials = userName.trim().charAt(0).toUpperCase() || 'И';

  // ИНИЦИАЛИЗАЦИЯ: читаем состояние попыток/блокировки из localStorage устройства
  useEffect(() => {
    setPin('');
    setErr(null);
    setShake(false);
    setLockRemaining(0);
    submittedRef.current = false;

    if (typeof window === 'undefined') {
      setAttemptsLeft(MAX_ATTEMPTS);
      setLocked(false);
      setLockUntil(null);
      return;
    }

    try {
      const storedAttempts = window.localStorage.getItem(STORAGE_ATTEMPTS_KEY);
      const storedLockUntil = window.localStorage.getItem(STORAGE_LOCK_UNTIL_KEY);

      let nextAttempts = MAX_ATTEMPTS;
      let nextLocked = false;
      let nextLockUntil: number | null = null;

      if (storedAttempts !== null) {
        const n = Number(storedAttempts);
        if (!Number.isNaN(n) && n >= 0 && n <= MAX_ATTEMPTS) {
          nextAttempts = n;
        }
      }

      if (storedLockUntil !== null) {
        const ts = Number(storedLockUntil);
        if (!Number.isNaN(ts) && ts > Date.now()) {
          nextLocked = true;
          nextLockUntil = ts;
        } else {
          // просроченная блокировка — очищаем
          window.localStorage.removeItem(STORAGE_LOCK_UNTIL_KEY);
        }
      }

      setAttemptsLeft(nextAttempts);
      setLocked(nextLocked);
      setLockUntil(nextLockUntil);
    } catch {
      setAttemptsLeft(MAX_ATTEMPTS);
      setLocked(false);
      setLockUntil(null);
    }
  }, []);

  const handleUnlock = useCallback(async () => {
    // если сейчас загрузка, блокировка или PIN не из 4 цифр — выходим
    if (busy || locked || pin.length !== 4 || submittedRef.current) return;

    submittedRef.current = true; // помечаем: эта комбинация уже ушла
    setErr(null);
    setBusy(true);

    try {
      await unlockWithPin(pin);

      // Успешный вход — полный сброс безопасности
      setPin('');
      setAttemptsLeft(MAX_ATTEMPTS);
      setLocked(false);
      setLockUntil(null);
      setLockRemaining(0);

      // чистим localStorage
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(STORAGE_ATTEMPTS_KEY);
          window.localStorage.removeItem(STORAGE_LOCK_UNTIL_KEY);
        } catch {}
      }
    } catch (e) {
      const message = rusify(e as any) || 'Неверный PIN-код';
      setErr(message);

      // уменьшаем счётчик попыток и, при необходимости, блокируем
      setAttemptsLeft((prev) => {
        const next = Math.max(0, prev - 1);

        // сохраняем остаток попыток на устройстве
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(STORAGE_ATTEMPTS_KEY, String(next));
          } catch {}
        }

        // next:
        //  при 1-й ошибке  4 → 3 (показываем "осталось 3 попытки")
        //  при 2-й         3 → 2
        //  при 3-й         2 → 1
        //  при 4-й         1 → 0 → БЛОКИРУЕМ
        if (next <= 0) {
          const until = Date.now() + LOCK_SECONDS * 1000;
          setLocked(true);
          setLockUntil(until);

          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(STORAGE_LOCK_UNTIL_KEY, String(until));
            } catch {}
          }
        }

        return next;
      });

      // тряска + вибрация
      setShake(true);
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate?.(200);
        } catch {}
      }

      // оставляем красные точки ~0.8s, потом очищаем PIN и разрешаем новую попытку
      setTimeout(() => {
        setPin('');
        setShake(false);
        submittedRef.current = false;
      }, 800);
    } finally {
      setBusy(false);
    }
  }, [busy, locked, pin, unlockWithPin]);

  // Таймер блокировки (обратный отсчёт)
  useEffect(() => {
    if (!locked || !lockUntil) {
      setLockRemaining(0);
      return;
    }

    const tick = () => {
      const diff = Math.max(0, Math.floor((lockUntil - Date.now()) / 1000));
      setLockRemaining(diff);

      if (diff <= 0) {
        // Блокировка закончилась — сбрасываем защиту
        setLocked(false);
        setLockUntil(null);
        setAttemptsLeft(MAX_ATTEMPTS);
        setErr(null);
        setPin('');
        submittedRef.current = false;

        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem(STORAGE_ATTEMPTS_KEY);
            window.localStorage.removeItem(STORAGE_LOCK_UNTIL_KEY);
          } catch {}
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [locked, lockUntil]);

  // Клавиатура: цифры / Backspace / Enter
  useEffect(() => {
    if (!hasSession || !hasPin || !needsPin) return;

    const onKey = (e: KeyboardEvent) => {
      if (busy || locked) return;

      if (e.key === 'Enter') {
        void handleUnlock();
        return;
      }

      if (/^\d$/.test(e.key)) {
        setPin((prev) => {
          // если была ошибка — начинаем новый ввод с нуля
          const base = err ? '' : prev;
          if (err) setErr(null);
          if (base.length >= 4) return base;
          return (base + e.key).slice(0, 4);
        });
        return;
      }

      if (e.key === 'Backspace') {
        setPin((prev) => {
          const base = err ? '' : prev;
          if (err) setErr(null);
          return base.slice(0, -1);
        });
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, hasSession, hasPin, needsPin, handleUnlock, err, locked]);

  // Автосабмит при 4 цифрах
  useEffect(() => {
    if (!hasSession || !hasPin || !needsPin) return;
    if (pin.length === 4 && !busy && !submittedRef.current && !locked) {
      void handleUnlock();
    }
  }, [pin, busy, hasSession, hasPin, needsPin, handleUnlock, locked]);

  // Как только пользователь начал менять PIN после отправки —
  // считаем, что это НОВАЯ попытка → можно снова отправлять при 4 цифрах.
  useEffect(() => {
    if (submittedRef.current && pin.length < 4) {
      submittedRef.current = false;
    }
  }, [pin]);

  // Когда overlay включился — очищаем только ввод/ошибку, но не сбрасываем счётчик/блокировку
  useEffect(() => {
    if (hasSession && hasPin && needsPin) {
      setPin('');
      setErr(null);
      setShake(false);
      submittedRef.current = false;
    }
  }, [hasSession, hasPin, needsPin]);

  const handleLogoutClick = async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  };

  // Если PIN не нужен — ничего не рисуем
  if (!hasSession || !hasPin || !needsPin) {
    return null;
  }

  // Экран блокировки
  if (locked) {
    return (
      <div className="pin-overlay">
        <div className="pin-overlay__backdrop" />
        <div className="pin-overlay__content pin-overlay__content--locked">
          <div className="pin-lock">
            <div className="pin-lock__title">Вход по&nbsp;PIN заблокирован</div>
            <div className="pin-lock__timer">{formatTime(lockRemaining)}</div>
            <div className="pin-lock__subtitle">
              Попробуйте снова, когда таймер закончится.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Показ счётчика:
  //  после 1-й ошибки attemptsLeft = 3 → «Осталось 3 попытки»
  //  после 2-й ошибки attemptsLeft = 2 → «Осталось 2 попытки»
  //  после 3-й ошибки attemptsLeft = 1 → «Осталась 1 попытка»
  //  при попытке №4 attemptsLeft → 0 → сразу блокировка, сюда не попадаем
  const showAttempts =
    attemptsLeft < MAX_ATTEMPTS && attemptsLeft > 0;

  return (
    <div className="pin-overlay">
      <div className="pin-overlay__backdrop" />

      <div className="pin-overlay__content">
        {/* аватар + приветствие + имя + телефон */}
        <div className="pin-overlay__head">
          <div className="pin-user pin-user--stacked">
            <div className="pin-user__avatar">{initials}</div>
            <div className="pin-user__greeting">{greeting}</div>
            <div className="pin-user__name">{userName}</div>
            <div className="pin-user__phone">{userPhone}</div>
          </div>
        </div>

        {/* метка + ячейки PIN сразу под телефоном */}
        <div className="pin-overlay__prompt">
          {err ? (
            <div className="pin-overlay__error">{err}</div>
          ) : (
            <p className="pin-overlay__subtitle">Введите PIN-код</p>
          )}

          <div className={'pin-input' + (shake ? ' pin-input--shake' : '')}>
            {Array.from({ length: 4 }).map((_, i) => {
              let cls = 'pin-input__dot';
              if (i < pin.length) cls += ' pin-input__dot--filled';
              if (err) cls += ' pin-input__dot--error';
              return <span key={i} className={cls} />;
            })}
          </div>

          {showAttempts && (
            <div className="pin-attempts">
              Осталось {attemptsLeft} {formatAttemptsWord(attemptsLeft)}
            </div>
          )}
        </div>

        {/* снизу — сам пин-пад */}
        <div className="pin-overlay__foot pin-overlay__foot--left">
          <div className="pinpad-wrapper-left">
            <PinPad
              value={pin}
              onChange={(v) => {
                if (locked) return;
                const raw = String(v).replace(/\D/g, '');
                let clean = raw.slice(0, 4);

                // если была ошибка — начинаем ввод с нуля
                if (err) {
                  setErr(null);
                  clean = raw.slice(-4).slice(0, 4);
                }

                setPin(clean);
              }}
              disabled={busy || locked}
              onLogout={handleLogoutClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPinOverlay;
