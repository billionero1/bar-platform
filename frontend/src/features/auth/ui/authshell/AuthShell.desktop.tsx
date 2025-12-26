import React from 'react';
import { Outlet } from 'react-router-dom';
import AuthBrandDesktop from '../authbrand/AuthBrand.desktop';

import "../_shared/auth.shared.css";
import "../_shared/auth.desktop.css";


const AuthShellDesktop: React.FC = () => {
  return (
    <div className="auth-screen auth-screen--split">
      <div className="login-layout">
        <AuthBrandDesktop />

        <section className="login-right">
          <div className="login-right-inner">
            <Outlet />
          </div>
        </section>
      </div>
    </div>
  );
};

export default AuthShellDesktop;
