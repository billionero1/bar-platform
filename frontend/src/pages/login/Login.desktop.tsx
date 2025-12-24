// src/pages/login/Login.desktop.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { usePasswordLogin } from '../../hooks/login/usePasswordLogin';

const LoginDesktop: React.FC = () => {
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
      <header className="login-header">
        <h2>Вход</h2>
        <p className="login-header-sub">
          Введите номер телефона и пароль, чтобы продолжить работу.
        </p>
      </header>

      <form className="login-form" onSubmit={submit}>
        <label>Телефон</label>
        <input
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          onKeyDown={onPhoneKeyDown}
          onPaste={onPhonePaste} // ← обработка paste так же, как была
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

        <div className="login-links-row">
          <Link className="link-text" to="/recover">
            Забыли пароль?
          </Link>
          <span className="login-links-divider" />
          <Link className="link-text" to="/register">
            Регистрация
          </Link>
        </div>
      </form>
    </>
  );
};

export default LoginDesktop;
