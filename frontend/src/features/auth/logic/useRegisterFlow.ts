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

    const cleanName = name.trim();
    if (!cleanName) return;

    setBusy(true);
    try {
      const now = Date.now();
      if (lastVerifyAtRef.current && now - lastVerifyAtRef.current < 5_000) {
        return;
      }

      await api('/v1/auth/request-verify', {
        method: 'POST',
        body: JSON.stringify({ phone: apiPhone, name: cleanName }),
      });

      lastVerifyAtRef.current = now;
      startResendTimer();
      setStep('code');
    } catch (e: any) {
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
      await api('/v1/auth/request-verify', {
        method: 'POST',
        body: JSON.stringify({ phone: apiPhone }),
      });
      startResendTimer();
    } catch (e: any) {
      setErr(rusify(e));
    }
  }, [apiPhone, startResendTimer]);

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
    goLogin,
    goLoginWithPhone,
  };
};
