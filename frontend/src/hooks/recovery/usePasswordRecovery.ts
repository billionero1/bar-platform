// src/hooks/recovery/usePasswordRecovery.ts

import React, { useContext, useMemo, useRef, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { api } from '../../lib/api';

import { rusify } from '../../lib/errors';

import { AuthContext } from '../../AuthContext';

import {

  formatPhone,

  toApiWithPlus,

  toDbDigits,

  handlePhoneBackspace,

} from '../../lib/phone';

import { useResendTimer } from '../ResendTimer';



export type RecoverStep = 'phone' | 'code' | 'password';



export const usePasswordRecovery = () => {

  const nav = useNavigate();

  const { hydrate, loginPassword } = useContext(AuthContext);



  const [step, setStep] = useState<RecoverStep>('phone');

  const [phone, setPhone] = useState('+7 ');

  const [code, setCode] = useState('');

  const [pass1, setPass1] = useState('');

  const [pass2, setPass2] = useState('');

  const [show1, setShow1] = useState(false);

  const [show2, setShow2] = useState(false);

  const [err, setErr] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);



  const { canResend, leftSec, start: startResendTimer } = useResendTimer({

    defaultDelaySec: 30,

  });



  // защита от спама /request-reset

  const lastResetAtRef = useRef<number | null>(null);



  // для /request-reset и /reset-password (+79...)

  const apiPhone = useMemo(() => toApiWithPlus(phone), [phone]);

  // для fallback-логина (79...)

  const dbPhone = useMemo(() => toDbDigits(phone), [phone]);



  // маска ввода телефона + ограничение 11 цифрами

  const onPhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) =>

    handlePhoneBackspace(e, setPhone, () => phone);



  const onPhoneChange = (v: string) => {

    const digits = v.replace(/\D/g, '');

    if (digits.length > 11) return; // не даём ввести больше 11 цифр

    setPhone(formatPhone(v));

  };



  // шаг назад

  const backStep = () => {

    setErr(null);

    if (step === 'phone') {

      nav('/login');

    } else if (step === 'code') {

      setStep('phone');

    } else if (step === 'password') {

      setStep('code');

    }

  };



  // шаг 1 — телефон

  const nextPhone = async (e: React.FormEvent) => {

    e.preventDefault();

    setErr(null);



    if (dbPhone.length !== 11) {

      setErr('Введите полный номер телефона');

      return;

    }



    setBusy(true);



    try {

      const now = Date.now();

      // если только что уже запрашивали — просто идём на шаг кода

      if (lastResetAtRef.current && now - lastResetAtRef.current < 55_000) {

        setStep('code');

        return;

      }



      await api('/v1/auth/request-reset', {

        method: 'POST',

        body: JSON.stringify({ phone: apiPhone }),

      });



      lastResetAtRef.current = now;

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

    setStep('password');

  };



  // отправка кода ещё раз

  const resendCode = async () => {

    try {

      await api('/v1/auth/request-reset', {

        method: 'POST',

        body: JSON.stringify({ phone: apiPhone }),

      });

      startResendTimer();

    } catch (e: any) {

      setErr(rusify(e));

    }

  };



  // шаг 3 — новый пароль

  const finish = async (e: React.FormEvent) => {

    e.preventDefault();



    const canCompare = pass1.length > 0 && pass2.length >= pass1.length;

    if (!canCompare || pass1 !== pass2) {

      setErr('Пароли не совпадают');

      return;

    }



    if (pass1.length < 8) {

      setErr('Пароль должен содержать минимум 8 символов');

      return;

    }

    if (!/[A-Z]/.test(pass1)) {

      setErr('Пароль должен содержать хотя бы одну заглавную букву');

      return;

    }

    if (!/[a-z]/.test(pass1)) {

      setErr('Пароль должен содержать хотя бы одну строчную букву');

      return;

    }

    if (!/[0-9]/.test(pass1)) {

      setErr('Пароль должен содержать хотя бы одну цифру');

      return;

    }



    setErr(null);

    setBusy(true);



    try {

      const r = await api<{ ok: boolean; access?: string; user?: any }>(

        '/v1/auth/reset-password',

        {

          method: 'POST',

          body: JSON.stringify({

            phone: apiPhone,

            code,

            new_password: pass1,

          }),

        },

      );



      if (r?.access && r?.user) {

        hydrate({ access: r.access, user: r.user });

        nav('/');

        return;

      }



      // fallback — логинимся руками

      await loginPassword({ phone: dbPhone, password: pass1 });

      nav('/');

    } catch (e: any) {

      setErr(rusify(e));

    } finally {

      setBusy(false);

    }

  };



  const toggleShow1 = () => setShow1((s) => !s);

  const toggleShow2 = () => setShow2((s) => !s);



  const canComparePasswords =

    pass1.length > 0 && pass2.length >= pass1.length;

  const passwordsMismatch = canComparePasswords && pass1 !== pass2;



  const canProceedPasswordStep =

    !busy && pass1.length > 0 && canComparePasswords && !passwordsMismatch;



  const canSubmitPhone = !busy && dbPhone.length === 11;

  const canSubmitCode = !busy && code.length === 4;



  const goLogin = () => nav('/login');



  return {

    // шаг

    step,



    // значения

    phone,

    code,

    pass1,

    pass2,



    // флаги

    show1,

    show2,

    err,

    busy,

    canResend,

    leftSec,



    passwordsMismatch,

    canProceedPasswordStep,

    canSubmitPhone,

    canSubmitCode,



    // обработчики ввода

    onPhoneKeyDown,

    onPhoneChange,

    setCode,

    setPass1,

    setPass2,

    toggleShow1,

    toggleShow2,



    // навигация / действия

    backStep,

    nextPhone,

    nextCode,

    resendCode,

    finish,

    goLogin,

  };

};
