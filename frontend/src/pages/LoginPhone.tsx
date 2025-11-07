// src/pages/LoginPhone.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

function normalizePhone(input: string) {
  // оставляем цифры, принудительно +7XXXXXXXXXX
  const digits = input.replace(/\D/g, '');
  let n = digits;
  if (n.startsWith('8')) n = '7' + n.slice(1);
  if (!n.startsWith('7')) n = '7' + n; // подставим 7, если нет
  return '+' + n;
}

export default function LoginPhone() {
  const nav = useNavigate();
  const { requestPin } = useAuth();
  const [val, setVal] = useState('+7');

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    // курсор после +7 — вынуждаем формат
    if (!v.startsWith('+7')) {
      setVal('+7' + v.replace(/\D/g, '').replace(/^7/, '')); 
    } else {
      setVal(normalizePhone(v));
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = val.replace(/\D/g, ''); // для API: 7925...
    if (phone.length < 11) return; // простая проверка
    await requestPin(phone);
    localStorage.setItem('login_phone', phone);
    nav('/login/pin');
  };

  return (
    <div className="mx-auto max-w-sm p-4">
      <h1 className="text-xl font-semibold mb-4">Вход</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">Телефон</label>
        <input
          className="w-full border rounded p-2"
          value={val}
          onChange={onChange}
          inputMode="numeric"
          autoFocus
        />
        <button className="w-full rounded bg-black text-white py-2">Продолжить</button>
      </form>
      <p className="mt-3 text-xs text-gray-500">
        Мы отправим 4-значный PIN для входа.
      </p>
    </div>
  );
}
