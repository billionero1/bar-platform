// src/features/auth/ui/register/Register.tsx
import React from 'react';
import { useRegisterFlow } from '../../logic/useRegisterFlow';

import '../_shared/auth.shared.css';
import './Register.css';

const Register: React.FC = () => {
  const {
    step,
    name,
    phone,
    code,
    pass1,
    pass2,
    show1,
    show2,
    err,
    busy,
    phoneAlreadyRegistered,
    telegramBind,
    canResend,
    leftSec,
    passwordsMismatch,
    canProceedPasswordStep,
    canSubmitPhone,
    handleNameChange,
    onPhoneChange,
    onPhoneKeyDown,
    handleCodeChange,
    setPass1,
    setPass2,
    toggleShow1,
    toggleShow2,
    handleBackClick,
    nextPhone,
    nextCode,
    nextPassword,
    resendCode,
    openTelegramBinding,
    checkTelegramBinding,
    goLogin,
    goLoginWithPhone,
  } = useRegisterFlow();

  return (
    <div className="auth-page">
      <div className="auth-page-main auth-page-main--top">
        <header className="login-header login-header--with-back">
          <div className="login-header-top">
            <button
              type="button"
              className="login-header-back"
              aria-label="Назад"
              onClick={handleBackClick}
            />
            <h2>Регистрация</h2>
          </div>

          <p className="login-header-sub">
            {step === 'phone' &&
              'Укажите имя и номер телефона. После нажатия кнопки откроется Telegram для подтверждения.'}
            {step === 'code' &&
              'Введите код из сообщения, чтобы подтвердить номер.'}
            {step === 'password' && 'Придумайте пароль для входа в сервис.'}
          </p>
        </header>

        {step === 'phone' && (
          <form className="login-form" onSubmit={nextPhone}>
            <label>Имя</label>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Как к вам обращаться"
            />

            <label>Телефон</label>
            <input
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              onKeyDown={onPhoneKeyDown}
              inputMode="tel"
              placeholder="+7 (___) ___ __ __"
            />

            {phoneAlreadyRegistered && (
              <div className="muted" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="link-text"
                  onClick={goLoginWithPhone}
                >
                  Войти с этим номером
                </button>
              </div>
            )}

            {telegramBind && (
              <div className="register-tg-box">
                <div className="register-tg-title">
                  Подтвердите номер в Telegram.
                </div>
                <div className="register-tg-text">
                  Нажмите Start у бота и вернитесь в регистрацию.
                </div>
                <div className="register-tg-actions">
                  <button
                    type="button"
                    className="link-text"
                    onClick={() => openTelegramBinding()}
                    disabled={busy}
                  >
                    Открыть Telegram
                  </button>
                  <button
                    type="button"
                    className="link-text"
                    onClick={checkTelegramBinding}
                    disabled={busy}
                  >
                    Я нажал Start, проверить
                  </button>
                </div>
                {telegramBind.status === 'expired' ? (
                  <div className="register-tg-text">
                    Ссылка устарела. Нажмите «Подтвердить через Telegram» ниже.
                  </div>
                ) : null}
              </div>
            )}

            {err && <div className="error">{err}</div>}

            <button type="submit" className="login-submit" disabled={!canSubmitPhone}>
              Подтвердить через Telegram
            </button>
          </form>
        )}

        {step === 'code' && (
          <form className="login-form" onSubmit={nextCode}>
            <label>Код из сообщения</label>
            <input
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              inputMode="numeric"
              maxLength={4}
            />

            {err && <div className="error">{err}</div>}

            <button
              type="submit"
              className="login-submit"
              disabled={busy || code.length !== 4}
            >
              Подтвердить
            </button>

            <div className="muted muted-center" style={{ marginTop: 8 }}>
              {canResend ? (
                <button type="button" className="link-text" onClick={resendCode}>
                  Отправить код ещё раз
                </button>
              ) : (
                <>Можно отправить код ещё раз через {leftSec} с</>
              )}
            </div>
          </form>
        )}

        {step === 'password' && (
          <form className="login-form" onSubmit={nextPassword}>
            <label>Пароль</label>
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
              Зарегистрироваться
            </button>
          </form>
        )}
      </div>

      <div className="auth-page-footer">
        <div className="login-links-row">
          <button type="button" className="link-text" onClick={goLogin}>
            Уже есть аккаунт? Войти
          </button>
        </div>
      </div>
    </div>
  );
};

export default Register;
