// src/pages/login/Login.mobile.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { usePasswordLogin } from '../../logic/usePasswordLogin';

const LoginMobile: React.FC = () => {
  const {
    phone,
    password,
    show,
    busy,
    err,
    apiPhone,
    setPassword,
    onPhoneKeyDown,
    onPhoneChange,
    onPhonePaste,
    toggleShow,
    submit,
  } = usePasswordLogin();

  return (
    <>
      {/* Бренд только на странице логина */}
      <div className="auth-brand-mobile">
        <div className="auth-brand-mobile__logo">ПРО.БАР</div>
      </div>

      {/* Вся группа (форма + ссылки) центрируется внутри карточки */}
      <div className="auth-page auth-page--center">
        <div className="auth-page-main">
          <div className="auth-page-inner auth-page-inner--login">


            <form className="login-form" onSubmit={submit}>
              <label>Телефон</label>
              <input
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                onKeyDown={onPhoneKeyDown}
                onPaste={onPhonePaste}
                inputMode="tel"
                placeholder="+7 (___) ___ __ __"
              />

              <label>Пароль</label>
              <div className="password-field">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="eye"
                  onClick={toggleShow}
                  aria-label="Показать пароль"
                />
              </div>

              {err && <div className="error">{err}</div>}

              <button
                type="submit"
                className="login-submit"
                disabled={busy || !apiPhone || !password}
              >
                Войти
              </button>
            </form>
          </div>
        </div>

        <div className="auth-page-footer">
          <div className="login-links-row">
            <Link className="link-text" to="/recover">
              Забыли пароль?
            </Link>
            <div className="login-links-divider" />
            <Link className="link-text" to="/register">
              Регистрация
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginMobile;
