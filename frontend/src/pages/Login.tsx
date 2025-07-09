/*  src/pages/Login.tsx
    ───────────────────────────────────────────────────────────
    Страница «Вход».

    • после успешного POST /auth/login передаём в AuthContext:
        – JWT-токен
        – флаг admin / user
        – имя пользователя
        – название заведения
    • телефоны вводим в формате +7 999 999 99 99
*/

import { useState, FormEvent } from 'react';
import { useNavigate, Link }   from 'react-router-dom';
import { useAuth }            from '../AuthContext';
import Toast from '../components/Toast';

const [showToast, setShowToast] = useState(false);
const [toastType, setToastType] = useState<'success' | 'error'>('success');


/* ─── утилиты для телефона ────────────────────────────── */
const normalize = (v: string) => v.replace(/\D/g, '').replace(/^8/, '7');

const format = (raw: string) => {
  const d = normalize(raw);
  let out = '+7 ';
  if (d.length > 1) out += d.slice(1, 4);
  if (d.length > 4) out += ' ' + d.slice(4, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  if (d.length > 9) out += ' ' + d.slice(9, 11);
  return out.trim();
};

/* ─── компонент «Вход» ────────────────────────────────── */
export default function Login() {
  const navigate          = useNavigate();
  const { login }         = useAuth();          // функция из AuthContext

  const [phone, setTel]   = useState('');
  const [pass , setPass]  = useState('');
  const [show , setShow]  = useState(false);
  const [busy , setBusy]  = useState(false);

  /* ── отправка формы ─────────────────────────────────── */
    async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: normalize(phone), password: pass }),
        },
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка входа');

      setToastType('success');
      setShowToast(true);

      setTimeout(() => {
        login(data.token);
        navigate('/main', { replace: true });
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setToastType('error');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } finally {
      setBusy(false);
    }
  }


const ready = normalize(phone).length === 11 && pass.length >= 4;

  /* ─── UI ────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded bg-white p-6 shadow"
      >
        <h1 className="mb-4 text-center text-2xl font-bold">Вход</h1>

        {/* телефон */}
        <input
          placeholder="Телефон"
          className="mb-3 w-full rounded border px-3 py-2"
          value={phone}
          onChange={e => setTel(format(e.target.value))}
        />

        {/* пароль + показать/скрыть */}
        <div className="relative mb-6">
          <input
            type={show ? 'text' : 'password'}
            placeholder="Пароль"
            className="w-full rounded border px-3 py-2 pr-16"
            value={pass}
            onChange={e => setPass(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-2 text-sm text-blue-600"
          >
            {show ? 'Скрыть' : 'Показать'}
          </button>
        </div>

        <button
          type="submit"
          disabled={!ready || busy}
          className={`w-full rounded py-2 text-white ${
            ready
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          {busy ? '…' : 'Войти'}
        </button>

        <p className="mt-4 text-center text-sm">
          <Link to="/register" className="text-blue-600 underline">
            Создать&nbsp;заведение
          </Link>
        </p>
      </form>
      <Toast show={showToast} type={toastType} />

    </div>
  );
}
