// src/pages/auth/AuthShell.desktop.tsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import AuthBrandDesktop from '../auth/AuthBrand.desktop';

const AuthShellDesktop: React.FC = () => {
  return (
    <div className="auth-screen auth-screen--split">
      <div className="login-layout">
        {/* Левый бренд-блок — отдельный компонент */}
        <AuthBrandDesktop />

        {/* Правая колонка: сюда подставляем логин / регистрацию / восстановление */}
        <section className="login-right">
          <div className="login-right-inner">
            {/* На мобиле это просто маленький лейбл над формой */}
            <div className="login-mobile-brand">
              ПРО.СЕРВСИ
            </div>

            {/* Outlet = “слот”, куда React Router отрендерит нужный компонент */}
            <Outlet />
          </div>
        </section>
      </div>
    </div>
  );
};

export default AuthShellDesktop;
