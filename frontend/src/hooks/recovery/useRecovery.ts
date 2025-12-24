// src/hooks/recovery/usePinRecovery.ts

import React, {

  useContext,

  useEffect,

  useMemo,

  useRef,

  useState,

} from 'react';

import { AuthContext } from '../../AuthContext';

import { rusify } from '../../lib/errors';

import { api } from '../../lib/api';

import {

  formatPhone,

  toDbDigits,

  handlePhoneBackspace,

} from '../../lib/phone';

import { useResendTimer } from '../ResendTimer';

import { useUserCard } from '../UserCard';



export type RecoverPinStep = 'phone' | 'code' | 'pin';



interface UsePinRecoveryOptions {

  onSuccess: () => void;

  onCancel: () => void;

}



export const usePinRecovery = ({ onSuccess, onCancel }: UsePinRecoveryOptions) => {

  const { user, lastPhone } = useContext(AuthContext);



  const { initialPhoneInput } = useUserCard(user, lastPhone, {

    defaultName: 'User',

    defaultPhoneExample: '+7 (___) ___-__-__',

  });



  const [phone, setPhone] = useState(initialPhoneInput);

  const [step, setStep] = useState<RecoverPinStep>('phone');



  const [code, setCode] = useState('');

  const [newPin, setNewPin] = useState('');

  const [err, setErr] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);



  const [maskPin, setMaskPin] = useState(false);

  const revealTimerRef = useRef<number | null>(null);



  const { canResend, leftSec, start: startResendTimer } = useResendTimer({

    defaultDelaySec: 30,

  });



  useEffect(() => {

    return () => {

      if (revealTimerRef.current) {

        window.clearTimeout(revealTimerRef.current);

      }

    };

  }, []);



  const apiPhone = useMemo(() => toDbDigits(phone), [phone]);



  const onPhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) =>

    handlePhoneBackspace(e, setPhone, () => phone);



  const onPhoneChange = (v: string) => {

    const digits = v.replace(/\D/g, '');

    if (digits.length > 11) return;

    setPhone(formatPhone(v));

  };



  const backStep = () => {

    setErr(null);

    if (step === 'phone') {

      onCancel();

    } else if (step === 'code') {

      setStep('phone');

    } else if (step === 'pin') {

      setStep('code');

    }

  };



  // шаг 1 — телефон

  const nextPhone = async (e: React.FormEvent) => {

    e.preventDefault();

    setErr(null);



    if (apiPhone.length !== 11) {

      setErr('Введите полный номер телефона');

      return;

    }



    setBusy(true);

    try {

      await api('/v1/auth/request-pin-reset', {

        method: 'POST',

        body: JSON.stringify({ phone: apiPhone }),

      });

      startResendTimer();

      setStep('code');

    } catch (e: any) {

      setErr(rusify(e));

    } finally {

      setBusy(false);

    }

  };



  // шаг 2 — код

  const nextCode = async (e: React.FormEvent) => {

    e.preventDefault();

    if (code.length !== 4) {

      setErr('Введите 4-значный код из SMS');

      return;

    }

    setErr(null);

    setStep('pin');

  };



  const resendCode = async () => {

    try {

      await api('/v1/auth/request-pin-reset', {

        method: 'POST',

        body: JSON.stringify({ phone: apiPhone }),

      });

      startResendTimer();

    } catch (e: any) {

      setErr(rusify(e));

    }

  };



  // шаг 3 — новый PIN

  const finish = async (e: React.FormEvent) => {

    e.preventDefault();



    if (newPin.length !== 4) {

      setErr('PIN должен состоять из 4 цифр');

      return;

    }



    setErr(null);

    setBusy(true);

    try {

      await api('/v1/auth/reset-pin', {

        method: 'POST',

        body: JSON.stringify({

          phone: apiPhone,

          code,

          new_pin: newPin,

        }),

      });



      onSuccess();

    } catch (e: any) {

      setErr(rusify(e));

    } finally {

      setBusy(false);

    }

  };



  const handlePinChange = (v: string | number) => {

    const raw = String(v).replace(/\D/g, '');

    const clean = raw.slice(0, 4);



    if (revealTimerRef.current) {

      window.clearTimeout(revealTimerRef.current);

    }

    setMaskPin(false);

    setNewPin(clean);



    if (clean.length > 0) {

      revealTimerRef.current = window.setTimeout(() => {

        setMaskPin(true);

      }, 500);

    }

  };



  const canSubmitPhone = apiPhone.length === 11 && !busy;

  const canSubmitCode = !busy && code.length === 4;

  const canFinish = !busy && newPin.length === 4;



  return {

    step,

    phone,

    code,

    newPin,

    err,

    busy,

    maskPin,

    canResend,

    leftSec,

    canSubmitPhone,

    canSubmitCode,

    canFinish,

    onPhoneKeyDown,

    onPhoneChange,

    setCode,

    handlePinChange,

    backStep,

    nextPhone,

    nextCode,

    resendCode,

    finish,

  };

};
