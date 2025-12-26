import React from 'react';
import { Outlet } from 'react-router-dom';

import "../_shared/auth.shared.css";
import './AuthShell.mobile.css';

const AuthShellMobile: React.FC = () => {
  return (
    <div className="auth-mobile-shell">
      <main className="auth-mobile-main">
        <div className="auth-mobile-card">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AuthShellMobile;
