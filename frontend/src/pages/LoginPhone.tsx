import React, { useRef, useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPhone() {
  const { requestPin } = useAuth();
  const [raw, setRaw] = useState<string>(''); // только цифры после 7
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    // ставим курсор в конец
    inputRef.current?.setSelectionRange(18, 18);
  }, [raw]);

  function format(v: string) {
    // v — цифры после 7
    const d = v.padEnd(10, '_').slice(0,10).split('');
    return `+7 (${d[0]}${d[1]}${d[2]}) ${d[3]}${d[4]}${d[5]}-${d[6]}${d[7]}-${d[8]}${d[9]}`.replaceAll('_',' ');
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const only = e.target.value.replace(/[^\d]/g, '');
    // удаляем первую 7, если пользователь ввёл её руками
    const digits = only.startsWith('7') ? only.slice(1) : only;
    setRaw(digits.slice(0,10));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (raw.length < 10) return;
    await requestPin(`7${raw}`);
    nav('/login/pin', { state: { phone: `7${raw}` } });
  }

  return (
    <form className="p-6 max-w-sm mx-auto space-y-4" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">Вход</h1>
      <label className="block text-sm">Телефон</label>
      <input
        ref={inputRef}
        value={format(raw)}
        onChange={onChange}
        inputMode="numeric"
        className="w-full border rounded px-3 py-2 font-mono tracking-wide"
        placeholder="+7 (___) ___-__-__"
      />
      <button className="w-full rounded bg-black text-white py-2">Продолжить</button>
      <p className="text-xs text-gray-500 text-center">
        Менеджер? <a href="/register" className="underline">Регистрация</a>
      </p>
    </form>
  );
}
