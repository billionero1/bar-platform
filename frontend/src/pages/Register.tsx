import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }   from '../AuthContext';

/* ─────────── хелперы для телефона ─────────── */
function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').replace(/^8/, '7');
  let r = '+7 ';
  if (d.length > 1) r += d.slice(1, 4);
  if (d.length >= 4) r += ' ' + d.slice(4, 7);
  if (d.length >= 7) r += ' ' + d.slice(7, 9);
  if (d.length >= 9) r += ' ' + d.slice(9, 11);
  return r.trim();
}
function normalizePhone(v: string) {
  const d = v.replace(/\D/g, '');
  return d.startsWith('8') ? '7' + d.slice(1) : d;
}

/* ─────────── компонент ─────────── */
export default function Register() {
  const [establishmentName, setEstablishmentName] = useState('');
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const nav  = useNavigate();
  const { login } = useAuth();

  /* ─── события ───────────────────────────── */
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setPhone(formatPhone(e.target.value));

  const passwordsMatch = password === confirm && password.length >= 6;

  async function handleRegister() {
    if (!passwordsMatch) return;

    if (
      !establishmentName.trim() ||
      !name.trim() ||
      !normalizePhone(phone)
    ) {
      alert('Пожалуйста, заполните все поля');
      return;
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/auth/register-manager`,
        {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({
            establishmentName,
            name,
            phone: normalizePhone(phone),
            password,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Ошибка регистрации');
        return;
      }

      login(data.token);
      nav('/main');
    } catch (err) {
      console.error('Ошибка запроса:', err);
      alert('Не удалось зарегистрироваться');
    }
  }

  /* ─── UI ─────────────────────────────────── */
  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-md rounded bg-white p-6 shadow'>
        <h1 className='mb-4 text-center text-2xl font-bold'>
          Регистрация менеджера
        </h1>

        <input
          className='mb-2 w-full border p-2'
          placeholder='Название заведения'
          value={establishmentName}
          onChange={(e) => setEstablishmentName(e.target.value)}
        />

        <input
          className='mb-2 w-full border p-2'
          placeholder='Имя'
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className='mb-2 w-full border p-2'
          placeholder='Телефон'
          value={phone}
          onChange={handlePhoneChange}
        />

        <div className='relative mb-2'>
          <input
            type={showPass ? 'text' : 'password'}
            className='w-full border p-2 pr-16'
            placeholder='Пароль (мин. 6 симв.)'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type='button'
            className='absolute right-2 top-2 text-sm text-blue-600'
            onClick={() => setShowPass(!showPass)}
          >
            {showPass ? 'Скрыть' : 'Показать'}
          </button>
        </div>

        <div className='relative mb-4'>
          <input
            type={showConfirm ? 'text' : 'password'}
            className='w-full border p-2 pr-16'
            placeholder='Повторите пароль'
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <button
            type='button'
            className='absolute right-2 top-2 text-sm text-blue-600'
            onClick={() => setShowConfirm(!showConfirm)}
          >
            {showConfirm ? 'Скрыть' : 'Показать'}
          </button>
        </div>

        <button
          disabled={!passwordsMatch}
          onClick={handleRegister}
          className={`w-full rounded py-2 text-white ${
            passwordsMatch ? 'bg-blue-600' : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          Зарегистрироваться
        </button>
      </div>
    </div>
  );
}
