// src/pages/recover/RecoverPassword.mobile.tsx

import React, {

  useContext,

  useRef,

  useMemo,

  useState,

} from 'react';

import { useNavigate } from 'react-router-dom';

import { api } from '../../shared/api'

import { rusify } from '../../shared/lib'

import { AuthContext } from '../../AuthContext';

import {

  formatPhone,

  toApiWithPlus,

  toDbDigits,

  handlePhoneBackspace,

} from '../../shared/lib'

import { useResendTimer } from '../../hooks/ResendTimer';



type Step = 'phone' | 'code' | 'password';



const RecoverMobile: React.FC = () => {

  const nav = useNavigate();

  const { hydrate, loginPassword } = useContext(AuthContext);



  const [step, setStep] = useState<Step>('phone');

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



  const lastResetAtRef = useRef<number | null>(null);



  const apiPhone = useMemo(() => toApiWithPlus(phone), [phone]);

  const dbPhone = useMemo(() => toDbDigits(phone), [phone]);



  // маска телефона + ограничение 11 цифрами

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

      nav('/login');

    } else if (step === 'code') {

      setStep('phone');

    } else if (step === 'password') {

      setStep('code');

    }

  };



  const handleBackClick = () => backStep();



  // Шаг 1 — телефон

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

      if (lastResetAtRef.current && now - lastResetAtRef.current < 55_000) {

        setStep('code');

        return;

      }



      await api('/v1/auth/request-reset', {

        method: 'POST',

        body: JSON.stringify({ phone: apiPhone }),

      });

      lastResetAtRef.current = now;

      setStep('code');

      startResendTimer();

    } catch (e: any) {

      setErr(rusify(e));

    } finally {

      setBusy(false);

    }

  };



  // Шаг 2 — код

  const nextCode = async (e: React.FormEvent) => {

    e.preventDefault();

    if (code.length !== 4) {

      setErr('Введите 4-значный код из SMS');

      return;

    }

    setErr(null);

    setStep('password');

  };



  // Шаг 3 — новый пароль

  const finish = async (e: React.FormEvent) => {

    e.preventDefault();



    const canCompare = pass1.length > 0 && pass2.length >= pass1.length;

    if (!canCompare || pass1 !== pass2) {

      setErr('Пароли не совпадают');

      return;

    }



    // Проверка сложности пароля

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



      await loginPassword({ phone: dbPhone, password: pass1 });

      nav('/');

    } catch (e: any) {

      setErr(rusify(e));

    } finally {

      setBusy(false);

    }

  };



  const canComparePasswords =

    pass1.length > 0 && pass2.length >= pass1.length;

  const passwordsMismatch = canComparePasswords && pass1 !== pass2;

  const canProceedPasswordStep =

    !busy && pass1.length > 0 && canComparePasswords && !passwordsMismatch;



  const phoneDigits = dbPhone;

  const canSubmitPhone = !busy && phoneDigits.length === 11;

  const canSubmitCode = !busy && code.length === 4;



  const isCodeStage = step === 'code';



  return (

    <div className="auth-page auth-page--top">

      <div className="auth-page-main">

        <div className="auth-page-inner auth-page-inner--recover">

          <header className="login-header login-header--with-back">

            <div className="login-header-top">

              <button

                type="button"

                className="login-header-back"

                aria-label="Назад"

                onClick={handleBackClick}

              />

              <h2>Восстановление пароля</h2>

            </div>

            <p className="login-header-sub">

              {step === 'phone' &&

                'Укажите номер телефона, мы отправим код восстановления.'}

              {step === 'code' &&

                'Введите код из SMS, чтобы подтвердить номер.'}

              {step === 'password' &&

                'Придумайте новый пароль для входа в сервис.'}

            </p>

          </header>



          {/* Шаг 1 + 2 — телефон и код на одной странице */}

          {(step === 'phone' || step === 'code') && (

            <form

              className="login-form"

              onSubmit={step === 'phone' ? nextPhone : nextCode}

            >

              <label>Телефон</label>

              <input

                value={phone}

                onChange={(e) => onPhoneChange(e.target.value)}

                onKeyDown={onPhoneKeyDown}

                inputMode="tel"

                placeholder="+7 (___) ___ __ __"

                disabled={isCodeStage || busy}

              />



              <div

                className={

                  'recover-inline-code' +

                  (isCodeStage ? ' recover-inline-code--visible' : '')

                }

              >

                <label>Код из SMS</label>

                <input

                  value={code}

                  onChange={(e) =>

                    setCode(e.target.value.replace(/\D/g, '').slice(0, 4))

                  }

                  inputMode="numeric"

                  maxLength={4}

                  disabled={!isCodeStage || busy}

                />



                <div

                  className="muted muted-center"

                  style={{ marginTop: 8 }}

                >

                  {isCodeStage &&

                    (canResend ? (

                      <button

                        type="button"

                        className="link-text"

                        onClick={async () => {

                          try {

                            await api('/v1/auth/request-reset', {

                              method: 'POST',

                              body: JSON.stringify({ phone: apiPhone }),

                            });

                            startResendTimer();

                          } catch (e: any) {

                            setErr(rusify(e));

                          }

                        }}

                        disabled={busy}

                      >

                        Отправить код ещё раз

                      </button>

                    ) : (

                      <>Можно отправить код ещё раз через {leftSec} с</>

                    ))}

                </div>

              </div>



              {err && <div className="error">{err}</div>}



              <button

                type="submit"

                className="login-submit"

                disabled={

                  busy ||

                  (step === 'phone' ? !canSubmitPhone : !canSubmitCode)

                }

              >

                {step === 'phone' ? 'Получить код' : 'Подтвердить'}

              </button>

            </form>

          )}



          {/* Шаг 3 — новый пароль */}

          {step === 'password' && (

            <form className="login-form" onSubmit={finish}>

              <label>Новый пароль</label>

              <div className="password-field">

                <input

                  type={show1 ? 'text' : 'password'}

                  value={pass1}

                  onChange={(e) => setPass1(e.target.value)}

                />

                <button

                  type="button"

                  className="eye"

                  onClick={() => setShow1((s) => !s)}

                  aria-label="Показать пароль"

                />

              </div>



              <label>Повторите пароль</label>

              <div className="password-field">

                <input

                  type={show2 ? 'text' : 'password'}

                  value={pass2}

                  onChange={(e) => setPass2(e.target.value)}

                />

                <button

                  type="button"

                  className="eye"

                  onClick={() => setShow2((s) => !s)}

                  aria-label="Показать пароль"

                />

              </div>



              {passwordsMismatch && (

                <div className="error">Пароли не совпадают</div>

              )}



              {err && <div className="error">{err}</div>}



              <button

                type="submit"

                className="login-submit"

                disabled={!canProceedPasswordStep}

              >

                Сохранить и войти

              </button>

            </form>

          )}

        </div>

      </div>



      <div className="auth-page-footer">

        <div className="login-links-row">

          <button

            type="button"

            className="link-text"

            onClick={() => nav('/login')}

          >

            Вспомнили пароль? Войти

          </button>

        </div>

      </div>

    </div>

  );

};



export default RecoverMobile;
