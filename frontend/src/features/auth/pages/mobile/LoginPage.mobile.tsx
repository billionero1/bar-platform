// src/features/auth/pages/mobile/LoginPage.mobile.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useLogin } from '../../hooks/useLogin';
import PhoneInput from '../../../../components/ui/Form/PhoneInput';
import PasswordInput from '../../../../components/ui/Form/PasswordInput';
import Button from '../../../../components/ui/Button/Button';
import './LoginPage.mobile.css';

const LoginPageMobile: React.FC = () => {
  const {
    phone,
    password,
    showPassword,
    busy,
    error,
    handlePhoneChange,
    handlePhoneKeyDown,
    handlePhonePaste,
    setPassword,
    toggleShowPassword,
    handleSubmit,
  } = useLogin();

  return (
    <div className="login-page-mobile">
      <div className="login-page-mobile__brand">
        <div className="login-page-mobile__logo">ПРО.БАР</div>
      </div>

      <form className="login-page-mobile__form" onSubmit={handleSubmit}>
        <h1 className="login-page-mobile__title">Вход</h1>
        <p className="login-page-mobile__subtitle">
          Введите номер телефона и пароль
        </p>

        <PhoneInput
          value={phone}
          onChange={handlePhoneChange}
          onKeyDown={handlePhoneKeyDown}
          onPaste={handlePhonePaste}
          disabled={busy}
        />

        <PasswordInput
          value={password}
          onChange={setPassword}
          showPassword={showPassword}
          onToggleShow={toggleShowPassword}
          disabled={busy}
          placeholder="Введите пароль"
        />

        {error && <div className="login-page-mobile__error">{error}</div>}

        <Button
          type="submit"
          disabled={busy || !phone || !password}
          loading={busy}
          fullWidth
          className="login-page-mobile__submit"
        >
          Войти
        </Button>

        <div className="login-page-mobile__links">
          <Link to="/recover" className="login-page-mobile__link">
            Забыли пароль?
          </Link>
          <span className="login-page-mobile__divider" />
          <Link to="/register" className="login-page-mobile__link">
            Регистрация
          </Link>
        </div>
      </form>
    </div>
  );
};

export default LoginPageMobile;