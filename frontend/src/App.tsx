import React from 'react';
import { Routes, Route } from 'react-router-dom';

import { RequireAuth, OnlyGuests } from './guards';
import { ThemeProvider } from './ThemeContext';

import AuthShell from './features/auth/ui/authshell/AuthShell';
import Login from './features/auth/ui/login/Login';
import Register from './features/auth/ui/register/Register';
import RecoverPassword from './features/auth/ui/recover/RecoverPassword';
import InviteOnboarding from './pages/system/ui/InviteOnboarding';

import LandingRedirect from "./pages/system/routing/LandingRedirect";
import Workspace from './pages/workspace/ui/Workspace';
import NotFound from './pages/system/ui/NotFound';

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Routes>
        {/* Умная точка входа */}
        <Route path="/" element={<LandingRedirect />} />

        {/* Auth: только для гостей */}
        <Route element={<OnlyGuests />}>
          <Route element={<AuthShell />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/recover" element={<RecoverPassword />} />
            <Route path="/onboarding/:token" element={<InviteOnboarding />} />
          </Route>
        </Route>

        {/* Workspace: только для авторизованных */}
        <Route element={<RequireAuth />}>
          <Route path="/workspace" element={<Workspace />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ThemeProvider>
  );
};

export default App;
