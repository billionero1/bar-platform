import React from 'react';
import { Routes, Route } from 'react-router-dom';

import { RequireAuth, OnlyGuests } from './guards';
import { ThemeProvider } from './ThemeContext';

// DESKTOP
import AuthShellDesktop from './pages/auth/AuthShell.desktop';
import LoginDesktop from './pages/login/Login.desktop';
import RegisterDesktop from './pages/register/Register.desktop';
import RecoverDesktop from './pages/recover/RecoverPassword.desktop';
import WorkspaceDesktop from './pages/workspace/Workspace.desktop';

// MOBILE
import AuthShellMobile from './pages/auth/AuthShell.mobile';
import LoginMobile from './pages/login/Login.mobile';
import RegisterMobile from './pages/register/Register.mobile';
import RecoverMobile from './pages/recover/RecoverPassword.mobile';
import WorkspaceMobile from './pages/workspace/Workspace.mobile';

const isMobile =
  typeof window !== 'undefined' &&
  (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) ||
    window.innerWidth <= 768
  );

const AuthShell = isMobile ? AuthShellMobile : AuthShellDesktop;
const Login = isMobile ? LoginMobile : LoginDesktop;
const Register = isMobile ? RegisterMobile : RegisterDesktop;
const Recover = isMobile ? RecoverMobile : RecoverDesktop;
const Workspace = isMobile ? WorkspaceMobile : WorkspaceDesktop;

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Routes>
        {/* Гостевые страницы под одним shell'ом */}
        <Route element={<OnlyGuests />}>
          <Route element={<AuthShell />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/recover" element={<Recover />} />
          </Route>
        </Route>

        {/* Приватные страницы */}
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Workspace />} />
        </Route>
      </Routes>
    </ThemeProvider>
  );
};

export default App;