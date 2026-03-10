// src/pages/auth/AuthShell.tablet.tsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import AuthBrandDesktop from '../authbrand/AuthBrand.desktop';

const AuthShellTablet: React.FC = () => {
  return (
    <div className="auth-screen auth-screen--split auth-screen--tablet">
      <div className="login-layout">
        <AuthBrandDesktop />

        <section className="login-right">
          <div className="login-right-inner">
            <div className="login-mobile-brand">ПРО.СЕРВСИ</div>
            <Outlet />
          </div>
        </section>
      </div>
    </div>
  );
};

export default AuthShellTablet;
