import React from 'react';
import { Routes, Route } from 'react-router-dom';

import { RequireAuth, OnlyGuests } from './guards';
import { ThemeProvider } from './ThemeContext';
import { useLayoutCtx } from './shared/ui/LayoutProvider';

import AuthShell from './features/auth/ui/authshell/AuthShell';
import Login from './features/auth/ui/login/Login';
import Register from './features/auth/ui/register/Register';
import RecoverPassword from './features/auth/ui/recover/RecoverPassword';
import Workspace from './pages/workspace/ui/Workspace';



const App: React.FC = () => {
  const layout = useLayoutCtx();

  const isMobile = layout === 'mobile';

  return (
    <ThemeProvider>
      <Routes>
        <Route element={<OnlyGuests />}>
          <Route element={<AuthShell />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/recover" element={<RecoverPassword />} />
          </Route>
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/" element={<Workspace />} />
        </Route>
      </Routes>
    </ThemeProvider>
  );
};

export default App;
