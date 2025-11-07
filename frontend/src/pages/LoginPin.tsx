import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function LoginPin() {
  const { state } = useLocation() as any;
  const { loginPin } = useAuth();
  const nav = useNavigate();
  const phone = state?.phone as string | undefined;
  const [code, setCode] = useState('');

  useEffect(() => { if (!phone) nav('/login'); }, [phone, nav]);

  async function press(d: string) {
    const next = (code + d).slice(0,4);
    setCode(next);
    if (next.length === 4 && phone) {
      try {
        await loginPin(phone, next);
        nav('/'); // в дом
      } catch {
        setCode('');
        // тут можно показать тост «Неверный код»
      }
    }
  }
  function backspace() { setCode(code.slice(0, -1)); }

  const dots = Array.from({length:4}).map((_,i)=>(
    <span key={i} className={`inline-block w-3 h-3 rounded-full mx-1 ${i<code.length?'bg-black':'bg-gray-300'}`}/>
  ));

  return (
    <div className="p-6 max-w-sm mx-auto space-y-4 text-center">
      <h1 className="text-xl font-semibold">Подтверждение</h1>
      <p className="text-sm text-gray-600">Мы отправили PIN на {phone?.replace(/^7/,'+7 ')}</p>
      <div className="mt-2">{dots}</div>

      <div className="grid grid-cols-3 gap-3 mt-6">
        {[...'123456789'].map(n=>(
          <button key={n} className="py-3 border rounded text-lg" onClick={()=>press(n)}>{n}</button>
        ))}
        <div />
        <button className="py-3 border rounded text-lg" onClick={()=>press('0')}>0</button>
        <button className="py-3 border rounded text-lg" onClick={backspace}>⌫</button>
      </div>
    </div>
  );
}
