// src/features/auth/hooks/useLogin.ts
import { useContext, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../../../services/auth/AuthContext';
import { rusify } from '../../../lib/errors';
import {
  formatPhone,
  toDbDigits,
  toApiWithPlus,
  handlePhoneBackspace,
  handlePhonePaste,
} from '../../../lib/phone';

export const useLogin = () => {
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
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiPhone = useMemo(() => toDbDigits(phone), [phone]);

  const handlePhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) =>
    handlePhoneBackspace(e, setPhone, () => phone);

  const handlePhoneChange = (v: string) => setPhone(formatPhone(v));

  const handlePhonePasteEvent = (e: React.ClipboardEvent<HTMLInputElement>) =>
    handlePhonePaste(e, setPhone);

  const toggleShowPassword = () => setShowPassword((s) => !s);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await loginPassword({
        phone: apiPhone,
        password,
      });
      nav('/');
    } catch (err: any) {
      setError(rusify(err));
    } finally {
      setBusy(false);
    }
  };

  return {
    // State
    phone,
    password,
    showPassword,
    busy,
    error,
    apiPhone,

    // Actions
    setPassword,
    handlePhoneKeyDown,
    handlePhoneChange,
    handlePhonePaste: handlePhonePasteEvent,
    toggleShowPassword,
    handleSubmit,
  };
};