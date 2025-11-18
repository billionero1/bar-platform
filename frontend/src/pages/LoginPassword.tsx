// src/pages/LoginPassword.tsx
import React, { useContext, useState, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { rusify } from '../lib/errors';
import { formatPhone, toDbDigits, toApiWithPlus, handlePhoneBackspace } from '../lib/phone';

export default function LoginPassword() {
  const nav = useNavigate();
  const location = useLocation();
  const { loginPassword, lastPhone } = useContext(AuthContext);

  const [phone, setPhone] = useState(() => {
    // 1) если пришли с регистрации: nav('/login', { state: { phone: '79...' } })
    const state = location.state as { phone?: string } | null;
    if (state?.phone) {
      // приводим '79...' к виду "+7 ..." для инпута
      return toApiWithPlus(state.phone);
    }

    // 2) иначе, если уже логинились раньше — используем сохранённый
    if (lastPhone) {
      return toApiWithPlus(lastPhone);
    }

    // 3) по умолчанию пустой номер
    return '+7 ';
  });

  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const apiPhone = useMemo(() => toDbDigits(phone), [phone]);
  const onPhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) =>
    handlePhoneBackspace(e, setPhone, () => phone);
  const onPhoneChange = (v: string) => setPhone(formatPhone(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await loginPassword({
        phone: apiPhone, // сервер нормализует, но шлём цифры
        password,
      });
      nav('/');
    } catch (e: any) {
      setErr(rusify(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="topbar">
        <h1>Вход</h1>
      </div>

      <form onSubmit={submit}>
        <label>Телефон</label>
        <input
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          onKeyDown={onPhoneKeyDown}
          inputMode="tel"
          placeholder="+7 (___) ___ __ __"
        />

        <label>Пароль</label>
        <div className="password-field">
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="eye"
            onClick={() => setShow((s) => !s)}
            aria-label="Показать пароль"
          />
        </div>

        {err && <div className="error">{err}</div>}
        <button disabled={busy || !apiPhone || !password}>Войти</button>

        <div className="muted" style={{ marginTop: 8 }}>
          <Link className="link-text" to="/recover">Забыли пароль?</Link>
        </div>

        <div className="muted" style={{ marginTop: 8 }}>
        <Link className="link-text" to="/register">Зарегистрироваться</Link>
        </div>
      </form>
    </div>
  );
}
