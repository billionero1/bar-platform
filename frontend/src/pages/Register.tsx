// src/pages/Register.tsx
import React, { useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import PinPad from '../components/PinPad';
import { rusify } from '../lib/errors';

type Step = 'phone' | 'code' | 'password' | 'pin';

function onlyDigits(s: string) { return s.replace(/\D/g, ''); }
function normalizePhoneToApi(masked: string) {
  let d = onlyDigits(masked);
  if (!d) return '';
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);
  return '+' + d;
}
function formatRuPhone(masked: string) {
  const d = onlyDigits(masked).slice(0, 11);
  let s = d;
  if (s.startsWith('8')) s = '7' + s.slice(1);
  if (!s.startsWith('7')) s = '7' + s;
  const arr = s.padEnd(11, '_').split('');
  return `+7 (${arr[1]}${arr[2]}${arr[3]}) ${arr[4]}${arr[5]}${arr[6]} ${arr[7]}${arr[8]} ${arr[9]}${arr[10]}`.replace(/_/g, '');
}

export default function Register() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('phone');

  const [phone, setPhone] = useState('+7 ');
  const [code, setCode] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [pin, setPin] = useState('');

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // чтобы "Назад→Вперёд" не ловило 429 (throttle 60s)
  const lastVerifyAtRef = useRef<number | null>(null);

  const apiPhone = useMemo(() => normalizePhoneToApi(phone), [phone]);

  const onPhoneChange = (v: string) => {
    const digits = onlyDigits(v);
    const limited = digits.slice(0, 11);
    const formatted = formatRuPhone(limited);
    setPhone(formatted);
  };

  const back = () => {
    setErr(null);
    if (step === 'code') setStep('phone');
    else if (step === 'password') setStep('code');
    else if (step === 'pin') setStep('password');
  };

  const nextPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const now = Date.now();
      // если в последние 55 сек уже запрашивали код — не дублируем запрос,
      // просто идём на шаг "код", чтобы не получить 429.
      if (lastVerifyAtRef.current && (now - lastVerifyAtRef.current) < 55_000) {
        setStep('code');
        return;
      }
      await api('/v1/auth/request-verify', { method: 'POST', body: JSON.stringify({ phone: apiPhone }) });
      lastVerifyAtRef.current = now;
      setStep('code');
    } catch (e: any) {
      setErr(rusify(e) || '...');
    } finally { setBusy(false); }
  };

  const nextCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await api('/v1/auth/verify-code', { method: 'POST', body: JSON.stringify({ phone: apiPhone, code }) });
      setStep('password');
    } catch (e: any) {
      setErr(rusify(e) || '...');
    } finally { setBusy(false); }
  };

  const nextPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass2.length >= pass1.length && pass1 !== pass2) {
      return setErr('Пароли не совпадают');
    }
    setErr(null);
    setStep('pin');
  };

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await api('/v1/auth/register-user', {
        method: 'POST',
        body: JSON.stringify({
          phone: apiPhone,
          password: pass1,
          pin: pin ? pin : undefined,
        }),
      });
      nav('/login');
    } catch (e: any) {
      setErr(rusify(e) || '...');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="topbar">
        {step !== 'phone' && <button className="back" onClick={back} aria-label="Назад" />}
        <h1>Регистрация</h1>
      </div>

      {step === 'phone' && (
        <form onSubmit={nextPhone}>
          <label>Телефон</label>
          <input
            value={phone}
            onChange={e=>onPhoneChange(e.target.value)}
            inputMode="tel"
            placeholder="+7 (___) ___ __ __"
          />
          <div className="hint">Мы отправим код для проверки номера</div>
          {err && <div className="error">{err}</div>}
          <button disabled={busy}>Продолжить</button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={nextCode}>
          <label>Код из сообщения</label>
          <input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" maxLength={4} />
          {err && <div className="error">{err}</div>}
          <button disabled={busy || code.length !== 4}>Подтвердить</button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={nextPassword}>
          <label>Пароль</label>
          <div className="password-field">
            <input
              type={show1 ? 'text' : 'password'}
              value={pass1}
              onChange={e=>setPass1(e.target.value)}
            />
            <button type="button" className="eye" onClick={()=>setShow1(s=>!s)} aria-label="Показать пароль"/>
          </div>

          <label>Повторите пароль</label>
          <div className="password-field">
            <input
              type={show2 ? 'text' : 'password'}
              value={pass2}
              onChange={e=>setPass2(e.target.value)}
            />
            <button type="button" className="eye" onClick={()=>setShow2(s=>!s)} aria-label="Показать пароль"/>
          </div>

          {(pass2.length >= pass1.length && pass1 !== pass2) && (
            <div className="error">Пароли не совпадают</div>
          )}

          {err && <div className="error">{err}</div>}
          <button disabled={busy || !pass1}>Далее</button>
        </form>
      )}

      {step === 'pin' && (
        <form onSubmit={finish} className="pin-step">
          <div className="hint">PIN (опционально) — для быстрого входа</div>
          <PinPad value={pin} onChange={setPin} />
          {err && <div className="error">{err}</div>}
          <button disabled={busy}>Завершить</button>
        </form>
      )}
    </div>
  );
}
