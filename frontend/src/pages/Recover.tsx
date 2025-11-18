// src/pages/Recover.tsx
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { rusify } from '../lib/errors';
import { AuthContext } from '../AuthContext';
import { formatPhone, toApiWithPlus, toDbDigits, handlePhoneBackspace } from '../lib/phone';

// шаги: телефон -> код -> новый пароль
type Step = 'phone' | 'code' | 'password';

export default function Recover() {
  const nav = useNavigate();
  const { hydrate, loginPassword } = useContext(AuthContext);

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('+7 ');
  const [code, setCode] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // resend timer (T-30s)
  const [resendAt, setResendAt] = useState<number>(0);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 300);
    return () => clearInterval(t);
  }, []);
  const leftSec = Math.max(0, Math.ceil((resendAt - nowTs) / 1000));
  const canResend = leftSec === 0;

  // защита от повторных кликов "назад-вперёд"
  const lastResetAtRef = useRef<number | null>(null);

  // Нормализованные представления телефона
  const apiPhone = useMemo(() => toApiWithPlus(phone), [phone]); // для /request-reset и /reset-password (+79...)
  const dbPhone  = useMemo(() => toDbDigits(phone),  [phone]);   // для fallback-логина (79...)

  // Маска ввода телефона
  const onPhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) =>
    handlePhoneBackspace(e, setPhone, () => phone);
  const onPhoneChange = (v: string) => setPhone(formatPhone(v));

  const back = useCallback(() => {
    setErr(null);
    if (step === 'phone') nav('/login');
    else if (step === 'code') setStep('phone');
    else if (step === 'password') setStep('code');
  }, [step, nav]);

  async function nextPhone(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const now = Date.now();
      if (lastResetAtRef.current && (now - lastResetAtRef.current) < 55_000) {
        setStep('code');
        return;
      }
      await api('/v1/auth/request-reset', {
        method: 'POST',
        body: JSON.stringify({ phone: apiPhone }),
      });
      setResendAt(Date.now() + 30_000);
      lastResetAtRef.current = now;
      setStep('code');
    } catch (e: any) {
      setErr(rusify(e));
    } finally {
      setBusy(false);
    }
  }

  async function nextCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    // На бекенде код проверяется на этапе /reset-password, отдельной проверки нет.
    setStep('password');
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    if (pass2.length >= pass1.length && pass1 !== pass2) {
      setErr('Пароли не совпадают');
      return;
    }
    setErr(null); setBusy(true);
    try {
      // Сбрасываем пароль; бек может вернуть {access,user} (совместимость)
      const r = await api<{ ok: boolean; access?: string; user?: any }>(
        '/v1/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({
            phone: apiPhone,   // +79... — как и в /request-reset
            code,
            new_password: pass1,
          }),
        }
      );

      if (r?.access && r?.user) {
        hydrate({ access: r.access, user: r.user });
        nav('/');
        return;
      }

      // Фолбэк: если сервер не выдал сессию — логинимся руками
      await loginPassword({ phone: dbPhone, password: pass1 });
      nav('/');
    } catch (e: any) {
      setErr(rusify(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="topbar">
        <button className="back" aria-label="Назад" onClick={back} />
        <h1>Восстановление доступа</h1>
      </div>

      {step === 'phone' && (
        <form onSubmit={nextPhone}>
          <label>Телефон</label>
          <input
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            onKeyDown={onPhoneKeyDown}
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
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            maxLength={4}
          />
          {err && <div className="error">{err}</div>}
          <button disabled={busy || code.length !== 4}>Подтвердить</button>

          <div className="muted" style={{ marginTop: 8 }}>
            {canResend ? (
              <button
                type="button"
                className="link-text"
                onClick={async () => {
                  try {
                    await api('/v1/auth/request-reset', {
                      method: 'POST',
                      body: JSON.stringify({ phone: apiPhone }),
                    });
                    setResendAt(Date.now() + 30_000);
                  } catch (e: any) {
                    setErr(rusify(e));
                  }
                }}
              >
                Отправить код ещё раз
              </button>
            ) : (
              <>Можно повторить через {leftSec} с</>
            )}
          </div>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={finish}>
          <label>Новый пароль</label>
          <div className="password-field">
            <input
              type={show1 ? 'text' : 'password'}
              value={pass1}
              onChange={(e) => setPass1(e.target.value)}
            />
            <button type="button" className="eye" onClick={() => setShow1((s) => !s)} aria-label="Показать пароль" />
          </div>

          <label>Повторите пароль</label>
          <div className="password-field">
            <input
              type={show2 ? 'text' : 'password'}
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
            />
            <button type="button" className="eye" onClick={() => setShow2((s) => !s)} aria-label="Показать пароль" />
          </div>

          {(pass2.length >= pass1.length && pass1 !== pass2) && (
            <div className="error">Пароли не совпадают</div>
          )}

          {err && <div className="error">{err}</div>}
          <button disabled={busy || !pass1}>Сохранить и войти</button>
        </form>
      )}
    </div>
  );
}
