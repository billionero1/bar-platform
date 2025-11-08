// src/pages/LoginPassword.tsx
import React, { useContext, useMemo, useState } from 'react';
import { AuthContext } from '../AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { rusify } from '../lib/errors';


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

export default function LoginPassword() {
  const { loginPassword } = useContext(AuthContext);
  const nav = useNavigate();

  const [phone, setPhone] = useState('+7 ');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apiPhone = useMemo(() => normalizePhoneToApi(phone), [phone]);

  const onPhoneChange = (v: string) => {
    const digits = onlyDigits(v);
    const limited = digits.slice(0, 11);
    const formatted = formatRuPhone(limited);
    setPhone(formatted);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await loginPassword({ phone: apiPhone, password });
      nav('/');
    } catch (e: any) {
      setErr(rusify(e) || 'Ошибка входа');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <h1>Вход</h1>
      <form onSubmit={submit}>
        <label>Телефон</label>
        <input
          value={phone}
          onChange={e => onPhoneChange(e.target.value)}
          inputMode="tel"
          placeholder="+7 (___) ___ __ __"
        />

        <label>Пароль</label>
        <div className="password-field">
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={e=>setPassword(e.target.value)}
            placeholder="Ваш пароль"
          />
          <button type="button" className="eye" onClick={()=>setShow(s=>!s)} aria-label="Показать пароль"/>
        </div>

        {err && <div className="error">{err}</div>}
        <button disabled={busy}>Продолжить</button>
      </form>

      <div className="muted" style={{ marginTop: 12 }}>
        <Link to="/register">Зарегистрироваться</Link>
      </div>
    </div>
  );
}
