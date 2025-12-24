// src/hooks/auth/usePasswordLogin.ts
import React, { useContext, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../../AuthContext';
import { rusify } from '../../lib/errors';
import {
  formatPhone,
  toDbDigits,
  toApiWithPlus,
  handlePhoneBackspace,
  handlePhonePaste,
} from '../../lib/phone';

export const usePasswordLogin = () => {
  const nav = useNavigate();
  const location = useLocation();
  const { loginPassword, lastPhone } = useContext(AuthContext);

  const [phone, setPhone] = useState(() => {
    const state = location.state as { phone?: string } | null;

    if (state?.phone) return toApiWithPlus(state.phone);
    if (lastPhone) return toApiWithPlus(lastPhone);
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

  const onPhonePaste = (e: React.ClipboardEvent<HTMLInputElement>) =>
    handlePhonePaste(e, setPhone);

  const toggleShow = () => setShow((s) => !s);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    try {
      await loginPassword({
        phone: apiPhone,
        password,
      });
      nav('/');
    } catch (e: any) {
      setErr(rusify(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    // state
    phone,
    password,
    show,
    busy,
    err,
    apiPhone,

    // setters
    setPassword,

    // handlers
    onPhoneKeyDown,
    onPhoneChange,
    onPhonePaste,
    toggleShow,
    submit,
  };
};
