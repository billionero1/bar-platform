// src/pages/LoginPin.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function LoginPin() {
  const nav = useNavigate();
  const { loginPin, isAuthenticated } = useAuth();
  const [code, setCode] = useState('');
  const phone = localStorage.getItem('login_phone') || '';

  useEffect(() => {
    if (isAuthenticated) nav('/main', { replace: true });
  }, [isAuthenticated, nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 4) return;
    await loginPin(phone, code);
    nav('/main', { replace: true });
  };

  return (
    <div className="mx-auto max-w-sm p-4">
      <h1 className="text-xl font-semibold mb-4">Введите PIN</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full border rounded p-2 tracking-widest text-center text-2xl"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoFocus
        />
        <button className="w-full rounded bg-black text-white py-2">Войти</button>
      </form>
      <div className="mt-4 text-sm text-gray-600">
        На номер: <b>+{phone}</b>
      </div>
    </div>
  );
}
