// src/pages/LoginPin.tsx
import React, { useContext, useMemo, useState } from 'react';
import { AuthContext } from '../AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import PinPad from '../components/PinPad';
import { rusify } from '../lib/errors';

function formatForView(phone: string | null) {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  const arr = d.padEnd(11, '_').split('');
  return `+7 (${arr[1]}${arr[2]}${arr[3]}) ${arr[4]}${arr[5]}${arr[6]} ${arr[7]}${arr[8]} ${arr[9]}${arr[10]}`.replace(/_/g, '');
}

export default function LoginPin() {
  const { unlockWithPin, lastPhone } = useContext(AuthContext);
  const nav = useNavigate();

  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const viewPhone = useMemo(() => formatForView(lastPhone), [lastPhone]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await unlockWithPin(pin);
      nav('/');
    } catch (e: any) {
      setErr(rusify(e) || 'Неверный PIN');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <h1>Быстрый вход</h1>
      {viewPhone && <div className="muted phone-view">{viewPhone}</div>}

      <form onSubmit={submit} className="pin-step">
        <PinPad value={pin} onChange={setPin} />
        {err && <div className="error">{err}</div>}
        <button disabled={busy || pin.length !== 4}>Разблокировать</button>
      </form>

      <div className="muted" style={{ marginTop: 12 }}>
        <Link to="/login">Войти телефоном и паролем</Link>
      </div>
    </div>
  );
}
