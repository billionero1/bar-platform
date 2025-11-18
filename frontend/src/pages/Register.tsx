// src/pages/Register.tsx
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import PinPad from '../components/PinPad';
import { rusify } from '../lib/errors';
import { AuthContext } from '../AuthContext';
import { formatPhone, toApiWithPlus, toDbDigits, handlePhoneBackspace } from '../lib/phone';

type Step = 'phone' | 'code' | 'password' | 'pin';

export default function Register() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('phone');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+7 ');
  const [code, setCode] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [pin, setPin] = useState('');
  

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [phoneAlreadyRegistered, setPhoneAlreadyRegistered] = useState(false);


  const { loginPassword, hydrate } = useContext(AuthContext);

  // resend timer (T-30s)
  const [resendAt, setResendAt] = useState<number>(0);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 300);
    return () => clearInterval(t);
  }, []);
  const leftSec = Math.max(0, Math.ceil((resendAt - nowTs) / 1000));
  const canResend = leftSec === 0;


  
  // чтобы «Назад→Вперёд» не ловило 429 (throttle 60s)
  const lastVerifyAtRef = useRef<number | null>(null);

  // Нормализованные представления телефона
  const apiPhone = useMemo(() => toApiWithPlus(phone), [phone]); // для /request-verify и /verify-code
  const dbPhone  = useMemo(() => toDbDigits(phone),  [phone]);   // для /register-user и /login-password

  // Маска ввода телефона
  const onPhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) =>
    handlePhoneBackspace(e, setPhone, () => phone);
  const onPhoneChange = (v: string) => {
    setPhone(formatPhone(v));
    // как только пользователь меняет номер — очищаем ошибку и сценарий "номер занят"
    if (err) setErr(null);
    if (phoneAlreadyRegistered) setPhoneAlreadyRegistered(false);
  };


  // Навигация назад по шагам
  const back = () => {
    setErr(null);
    if (step === 'code') setStep('phone');
    else if (step === 'password') setStep('code');
    else if (step === 'pin') setStep('password');
  };

  

  // Шаг 1 — ввод телефона → запросить код
  const nextPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setPhoneAlreadyRegistered(false);

    const cleanName = name.trim();
    if (!cleanName) {
      setErr('Введите имя');
      return;
    }

    setBusy(true);

    try {
      const now = Date.now();
      if (lastVerifyAtRef.current && (now - lastVerifyAtRef.current) < 55_000) {
        setStep('code');
        return;
      }

      await api('/v1/auth/request-verify', {
        method: 'POST',
        body: JSON.stringify({ phone: apiPhone }),
      });


      setResendAt(Date.now() + 30_000);
      lastVerifyAtRef.current = now;
      setStep('code');
    } catch (e: any) {
      const msg = rusify(e) || 'Не удалось отправить код.';
      setErr(msg);

      // если бэк вернул phone_already_registered → rusify даёт "Этот номер уже зарегистрирован"
      if (msg === 'Этот номер уже зарегистрирован') {
        setPhoneAlreadyRegistered(true);
      }
    } finally {
      setBusy(false);
    }
  };


  // Шаг 2 — подтверждение кода
  const nextCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await api('/v1/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ phone: apiPhone, code }),
      });
      setStep('password');
    } catch (e: any) {
      setErr(rusify(e) || 'Неверный или просроченный код.');
    } finally { setBusy(false); }
  };

  // Шаг 3 — установка пароля
const nextPassword = async (e: React.FormEvent) => {
  e.preventDefault();

  // Логика такая же, как у disabled/ошибки в JSX:
  // - пока нельзя нормально сравнить пароли — просто не идём дальше;
  // - если не совпадают — выходим молча, ошибка уже показана под полями.
  const canCompare = pass1.length > 0 && pass2.length >= pass1.length;

  if (!canCompare || pass1 !== pass2) {
    return;
  }

  setErr(null);
  setStep('pin');
};


  // Завершение регистрации (с PIN, если введён)
    // Завершение регистрации c PIN (строго 4 цифры)
  const finish = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (busy) return;

    // Жёсткое правило: через эту кнопку можно завершить ТОЛЬКО с полноценным PIN из 4 цифр
    if (pin.length !== 4) {
      return;
    }

    setErr(null);
    setBusy(true);

    try {
      const r = await api<{ access?: string | null; user?: any; ok?: boolean; user_id?: number }>(
        '/v1/auth/register-user',
        {
          method: 'POST',
          body: JSON.stringify({
            phone: dbPhone,          // формат 79XXXXXXXXX
            password: pass1,
            pin,                     // здесь уже точно 4 цифры
            name: name.trim(),       // <--- добавили
          }),
        }
      );


      // Бэк сразу создал sid-сессию и вернул user
      if (r && r.user) {
        hydrate({ user: r.user, access: r.access ?? null });
        nav('/');
        return;
      }

      // Фолбэк — заходим по паролю
      await loginPassword({ phone: dbPhone, password: pass1 });
      nav('/');
    } catch (e: any) {
      setErr(rusify(e));
    } finally {
      setBusy(false);
    }
  };


  // Пропуск PIN: регистрация без PIN
  const skipPin = async () => {
    if (busy) return;

    setErr(null);
    setBusy(true);

    try {
      const r = await api<{ access?: string | null; user?: any; ok?: boolean; user_id?: number }>(
        '/v1/auth/register-user',
        {
          method: 'POST',
          body: JSON.stringify({
            phone: dbPhone,
            password: pass1,
            name: name.trim(),   // <--- добавили
            // pin не отправляем
          }),
        }
      );


      if (r && r.user) {
        hydrate({ user: r.user, access: r.access ?? null });
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

    // Локальная логика проверки двух полей пароля для шага "password"
  const canComparePasswords =
    pass1.length > 0 && pass2.length >= pass1.length;

  const passwordsMismatch =
    canComparePasswords && pass1 !== pass2;

  const canProceedPasswordStep =
    !busy &&
    pass1.length > 0 &&
    canComparePasswords &&
    !passwordsMismatch;

  // Можно ли активировать кнопку "Завершить" на шаге PIN
  const canFinishWithPin =
    !busy &&
    pin.length === 4;
  

  return (
    <div className="auth">
      <div className="topbar">
        {step === 'phone' ? (
          <button className="back" onClick={() => nav('/login')} aria-label="Назад к входу" />
        ) : (
          <button className="back" onClick={back} aria-label="Назад" />
        )}
        <h1>Регистрация</h1>
      </div>

      {step === 'phone' && (
        <form onSubmit={nextPhone}>
          <label>Имя</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (err) setErr(null);
            }}
            placeholder="Как к вам обращаться"
          />

          <label>Телефон</label>
          <input
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            onKeyDown={onPhoneKeyDown}
            inputMode="tel"
            placeholder="+7 (___) ___ __ __"
          />

          {/* подсказку показываем только если номер ещё НЕ помечен как занятый */}
          {!phoneAlreadyRegistered && (
            <div className="hint">Мы отправим код для проверки номера</div>
          )}

          {err && <div className="error">{err}</div>}

          {/* если номер уже занят — не даём снова жать "Продолжить" */}
          <button
            disabled={
              busy ||
              phoneAlreadyRegistered ||
              !name.trim()
            }
          >
            Продолжить
          </button>

          {phoneAlreadyRegistered && (
            <div className="muted" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="link-text"
                onClick={() => nav('/login', { state: { phone: dbPhone } })}
              >
                Войти с этим номером
              </button>
            </div>
          )}
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
                    await api('/v1/auth/request-verify', {
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
              <>Можно отправить код ещё раз через {leftSec} с</>
            )}
          </div>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={nextPassword}>
          <label>Пароль</label>
          <div className="password-field">
            <input
              type={show1 ? 'text' : 'password'}
              value={pass1}
              onChange={(e) => setPass1(e.target.value)}
            />
            <button
              type="button"
              className="eye"
              onClick={() => setShow1((s) => !s)}
              aria-label="Показать пароль"
            />
          </div>

          <label>Повторите пароль</label>
          <div className="password-field">
            <input
              type={show2 ? 'text' : 'password'}
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
            />
            <button
              type="button"
              className="eye"
              onClick={() => setShow2((s) => !s)}
              aria-label="Показать пароль"
            />
          </div>

          {/* Ошибка несовпадения: показываем ОДИН раз, только когда реально есть что сравнивать */}
          {passwordsMismatch && (
            <div className="error">Пароли не совпадают</div>
          )}

          {/* Остальные ошибки (если вдруг будут) — ниже */}
          {err && <div className="error">{err}</div>}

          {/* Кнопка "Далее":
              - выключена, пока второй пароль короче первого
              - включается, когда строки совпадают
              - снова выключается, если пароли стали различаться
          */}
          <button disabled={!canProceedPasswordStep}>
            Далее
          </button>
        </form>
      )}


      {step === 'pin' && (
        <form onSubmit={finish} className="pin-step">
          <div className="hint">PIN (опционально) — для быстрого входа</div>

          <PinPad
            value={pin}
            onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
            disabled={busy}
          />

          {err && <div className="error">{err}</div>}

          {/* Завершить с PIN — только если введено ровно 4 цифры */}
          <button
            type="submit"
            className="pin-overlay__submit"
            disabled={!canFinishWithPin}
          >
            Завершить
          </button>

          <div className="muted" style={{ marginTop: 8 }}>
            <a
              href="#"
              className="link-text"
              onClick={(e) => {
                e.preventDefault();
                if (!busy) void skipPin();
              }}
            >
              Пропустить и завершить без PIN
            </a>
          </div>
        </form>
      )}


    </div>
  );
}
