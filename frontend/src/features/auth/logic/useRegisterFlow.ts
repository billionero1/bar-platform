// src/hooks/register/useRegisterFlow.ts
import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../shared/api'
import { AuthContext } from '../../../AuthContext';
import {
  rusify,
  formatPhone,
  toApiWithPlus,
  toDbDigits,
  handlePhoneBackspace,
} from '../../../shared/lib'
import { useResendTimer } from '../../../shared/lib/hooks/ResendTimer';

import type { UserPayload } from '../../../AuthContext';

type Step = 'phone' | 'code' | 'password';

type TelegramBindState = {
  token: string;
  bindUrl: string | null;
  botUsername: string | null;
  expiresAt: string | null;
  phoneMasked: string | null;
  purpose: string;
  status: 'pending' | 'bound' | 'expired';
};

function normalizeBotUsername(raw: unknown): string | null {
  const value = String(raw || '').trim().replace(/^@/, '');
  if (!value) return null;
  if (/^(your_|paste_|change_me)/i.test(value)) return null;
  return `@${value}`;
}

function parseTelegramBindState(error: any): TelegramBindState | null {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const isBindRequired =
    code === 'TELEGRAM_BIND_REQUIRED'
    || message === 'telegram_bind_required';

  if (!isBindRequired) return null;

  const details = (error?.details && typeof error.details === 'object') ? error.details : {};
  const token = String((details as any).token || '').trim();
  if (!token) return null;

  return {
    token,
    bindUrl: String((details as any).bind_url || '').trim() || null,
    botUsername: normalizeBotUsername((details as any).bot_username),
    expiresAt: String((details as any).expires_at || '').trim() || null,
    phoneMasked: String((details as any).phone_masked || '').trim() || null,
    purpose: String((details as any).purpose || 'verify'),
    status: 'pending',
  };
}

export const useRegisterFlow = () => {
  const nav = useNavigate();
  const { loginPassword, hydrate } = useContext(AuthContext);

  const [step, setStep] = useState<Step>('phone');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+7 ');
  const [code, setCode] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phoneAlreadyRegistered, setPhoneAlreadyRegistered] = useState(false);
  const [telegramBind, setTelegramBind] = useState<TelegramBindState | null>(null);

  const { canResend, leftSec, start: startResendTimer } = useResendTimer({
    defaultDelaySec: 30,
  });

  const lastVerifyAtRef = useRef<number | null>(null);

  const apiPhone = useMemo(() => toApiWithPlus(phone), [phone]);
  const dbPhone = useMemo(() => toDbDigits(phone), [phone]);

  const onPhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) =>
    handlePhoneBackspace(e, setPhone, () => phone);

  const handleNameChange = (value: string) => {
    setName(value);
    if (err) setErr(null);
  };

  const onPhoneChange = (v: string) => {
    setPhone(formatPhone(v));
    if (err) setErr(null);
    if (phoneAlreadyRegistered) setPhoneAlreadyRegistered(false);
    if (telegramBind) setTelegramBind(null);
  };

  const handleCodeChange = (value: string) => {
    setCode(value.replace(/\D/g, '').slice(0, 4));
  };

  const toggleShow1 = () => setShow1((s) => !s);
  const toggleShow2 = () => setShow2((s) => !s);

  const backStep = () => {
    setErr(null);
    if (step === 'code') setStep('phone');
    else if (step === 'password') setStep('code');
  };

  const goLogin = () => nav('/login');
  const goLoginWithPhone = () => nav('/login', { state: { phone: dbPhone } });

  const requestVerifyCode = useCallback(async (cleanName?: string) => {
    const payload: Record<string, unknown> = { phone: apiPhone };
    if (cleanName && cleanName.trim()) {
      payload.name = cleanName.trim();
    }
    await api('/v1/auth/request-verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }, [apiPhone]);

  const openTelegramBinding = useCallback((state?: TelegramBindState | null) => {
    const bind = state || telegramBind;
    const webUrl = String(bind?.bindUrl || '').trim();
    if (!webUrl || typeof window === 'undefined') return;

    let username = '';
    let startPayload = `bind_${bind?.token || ''}`;

    try {
      const parsed = new URL(webUrl);
      username = parsed.pathname.replace(/^\/+/, '').trim();
      const queryPayload = String(parsed.searchParams.get('start') || '').trim();
      if (queryPayload) startPayload = queryPayload;
    } catch {
      // ignore parse error and fallback to bot username
    }

    if (!username && bind?.botUsername) {
      username = bind.botUsername.replace(/^@/, '');
    }

    if (!username) {
      window.location.href = webUrl;
      return;
    }

    const appUrl = `tg://resolve?domain=${encodeURIComponent(username)}&start=${encodeURIComponent(startPayload)}`;
    const fallbackTimer = window.setTimeout(() => {
      if (!document.hidden) {
        window.location.href = webUrl;
      }
    }, 900);

    const clearFallback = () => window.clearTimeout(fallbackTimer);
    document.addEventListener('visibilitychange', clearFallback, { once: true });
    window.addEventListener('pagehide', clearFallback, { once: true });
    window.location.href = appUrl;
  }, [telegramBind]);

  const handleBackClick = () => {
    if (step === 'phone') {
      goLogin();
    } else {
      backStep();
    }
  };

  // Шаг 1 — телефон
  const nextPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setPhoneAlreadyRegistered(false);
    setTelegramBind(null);

    const cleanName = name.trim();
    if (!cleanName) return;

    setBusy(true);
    try {
      const now = Date.now();
      if (lastVerifyAtRef.current && now - lastVerifyAtRef.current < 5_000) {
        return;
      }

      await requestVerifyCode(cleanName);

      lastVerifyAtRef.current = now;
      startResendTimer();
      setStep('code');
    } catch (e: any) {
      const bindState = parseTelegramBindState(e);
      if (bindState) {
        setTelegramBind(bindState);
        setErr('Откройте Telegram, нажмите Start у бота и вернитесь сюда.');
        openTelegramBinding(bindState);
        return;
      }
      const msg = rusify(e);
      setErr(msg);
      if (msg.toLowerCase().includes('уже зарегистрирован')) {
        setPhoneAlreadyRegistered(true);
      }
    } finally {
      setBusy(false);
    }
  };

  // Шаг 2 — код
  const nextCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (code.length !== 4) return;
    setBusy(true);
    try {
      await api('/v1/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ phone: apiPhone, code }),
      });
      setStep('password');
    } catch (e: any) {
      setErr(rusify(e));
    } finally {
      setBusy(false);
    }
  };

  // Шаг 3 — пароль (теперь финальный)
  const nextPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const canCompare = pass1.length > 0 && pass2.length >= pass1.length;
    if (!canCompare || pass1 !== pass2) {
      setErr('Пароли не совпадают');
      return;
    }

    if (pass1.length < 8) {
      setErr('Пароль должен содержать минимум 8 символов');
      return;
    }
    if (!/[A-Z]/.test(pass1)) {
      setErr('Пароль должен содержать хотя бы одну заглавную букву');
      return;
    }
    if (!/[a-z]/.test(pass1)) {
      setErr('Пароль должен содержать хотя бы одну строчную букву');
      return;
    }
    if (!/[0-9]/.test(pass1)) {
      setErr('Пароль должен содержать хотя бы одну цифру');
      return;
    }

    setErr(null);
    setBusy(true);

    try {
      const r = await api<{
        user?: UserPayload;
        ok?: boolean;
        user_id?: number;
      }>('/v1/auth/register-user', {
        method: 'POST',
        body: JSON.stringify({
          phone: dbPhone,
          password: pass1,
          name: name.trim(),
        }),
      });

      if (r && r.user) {
        hydrate({ user: r.user });
        nav('/');
        return;
      }

      await loginPassword({ phone: dbPhone, password: pass1 });
      nav('/');
    } catch (e: any) {
      setErr(rusify(e));
    } finally {
      setBusy(false);
    }
  };

  const canComparePasswords = pass1.length > 0 && pass2.length >= pass1.length;
  const passwordsMismatch = canComparePasswords && pass1 !== pass2;
  const canProceedPasswordStep =
    !busy && pass1.length > 0 && canComparePasswords && !passwordsMismatch;
  const canSubmitPhone = !busy && !!name.trim() && !phoneAlreadyRegistered;

  const resendCode = useCallback(async () => {
    try {
      await requestVerifyCode();
      startResendTimer();
    } catch (e: any) {
      const bindState = parseTelegramBindState(e);
      if (bindState) {
        setTelegramBind(bindState);
        setStep('phone');
        setErr('Откройте Telegram, нажмите Start у бота и вернитесь сюда.');
        openTelegramBinding(bindState);
        return;
      }
      setErr(rusify(e));
    }
  }, [openTelegramBinding, requestVerifyCode, startResendTimer]);

  const checkTelegramBinding = useCallback(async () => {
    if (!telegramBind?.token) {
      setErr('Нажмите «Подтвердить через Telegram», чтобы получить ссылку.');
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ token: telegramBind.token });
      const status = await api<{
        status: 'pending' | 'bound' | 'expired';
      }>(`/v1/auth/telegram/bind-status?${qs.toString()}`, {
        method: 'GET',
      });

      if (status.status === 'bound') {
        await requestVerifyCode(name.trim());
        startResendTimer();
        setTelegramBind(null);
        setStep('code');
        return;
      }

      if (status.status === 'expired') {
        setTelegramBind((prev) => (prev ? { ...prev, status: 'expired' } : prev));
        setErr('Ссылка устарела. Нажмите «Подтвердить через Telegram», чтобы получить новую.');
        return;
      }

      setTelegramBind((prev) => (prev ? { ...prev, status: 'pending' } : prev));
      setErr('Подтверждение ещё не завершено. Нажмите Start в Telegram и проверьте снова.');
    } catch (e: any) {
      setErr(rusify(e));
    } finally {
      setBusy(false);
    }
  }, [name, requestVerifyCode, startResendTimer, telegramBind]);

  return {
    // состояние
    step,

    // значения
    name,
    phone,
    code,
    pass1,
    pass2,
    show1,
    show2,

    // флаги
    err,
    busy,
    phoneAlreadyRegistered,
    telegramBind,
    canResend,
    leftSec,
    passwordsMismatch,
    canProceedPasswordStep,
    canSubmitPhone,

    // хендлеры ввода
    handleNameChange,
    onPhoneChange,
    onPhoneKeyDown,
    handleCodeChange,
    setPass1,
    setPass2,
    toggleShow1,
    toggleShow2,

    // шаги / действия
    handleBackClick,
    nextPhone,
    nextCode,
    nextPassword,
    resendCode,
    openTelegramBinding,
    checkTelegramBinding,
    goLogin,
    goLoginWithPhone,
  };
};
