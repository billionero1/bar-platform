import React from 'react';
import { Routes, Route } from 'react-router-dom';

import { RequireAuth, OnlyGuests } from './guards';
import { ThemeProvider } from './ThemeContext';
import { useLayoutCtx } from './shared/ui/LayoutProvider';

import AuthShell from './pages/auth/AuthShell';
import Login from './features/auth/ui/login/Login';
import Register from './features/auth/ui/register/Register';
import RecoverPassword from './features/auth/ui/recover/RecoverPassword';



// DESKTOP
import WorkspaceDesktop from './pages/workspace/Workspace.desktop';

// MOBILE
import WorkspaceMobile from './pages/workspace/Workspace.mobile';

const App: React.FC = () => {
  const layout = useLayoutCtx();

  const isMobile = layout === 'mobile';

  // Register/Recover/Workspace пока по старой схеме
  const Workspace = isMobile ? WorkspaceMobile : WorkspaceDesktop;

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
