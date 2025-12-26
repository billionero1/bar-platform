// src/features/auth/ui/recover/RecoverPassword.tsx
import React from 'react';
import { usePasswordRecovery } from '../../logic/usePasswordRecovery';

import '../_shared/auth.shared.css';
import './RecoverPassword.css';

const RecoverPassword: React.FC = () => {
  const {
    step,
    phone,
    code,
    pass1,
    pass2,
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

    onPhoneKeyDown,
    onPhoneChange,

    setCode,
    setPass1,
    setPass2,

    toggleShow1,
    toggleShow2,

    backStep,
    nextPhone,
    nextCode,
    resendCode,
    finish,
    goLogin,
  } = usePasswordRecovery();

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
                onClick={backStep}
              />
              <h2>Восстановление пароля</h2>
            </div>

            <p className="login-header-sub">
              {step === 'phone' &&
                'Укажите номер телефона, мы отправим код восстановления.'}
              {step === 'code' && 'Введите код из SMS, чтобы подтвердить номер.'}
              {step === 'password' && 'Придумайте новый пароль для входа в сервис.'}
            </p>
          </header>

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

                <div className="muted muted-center" style={{ marginTop: 8 }}>
                  {isCodeStage &&
                    (canResend ? (
                      <button
                        type="button"
                        className="link-text"
                        onClick={resendCode}
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
                disabled={busy || (step === 'phone' ? !canSubmitPhone : !canSubmitCode)}
              >
                {step === 'phone' ? 'Получить код' : 'Подтвердить'}
              </button>
            </form>
          )}

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
                  onClick={toggleShow1}
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
                  onClick={toggleShow2}
                  aria-label="Показать пароль"
                />
              </div>

              {passwordsMismatch && <div className="error">Пароли не совпадают</div>}
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
          <button type="button" className="link-text" onClick={goLogin}>
            Вспомнили пароль? Войти
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecoverPassword;
