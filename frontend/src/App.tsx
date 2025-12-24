// src/App.tsx
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { RequireAuth, OnlyGuests } from './guards';
import { ThemeProvider } from './theme/ThemeProvider';
import LayoutProvider from './components/layout/LayoutProvider';

// Features
import LoginPage from './features/auth/pages/LoginPage';
import RegisterPage from './features/auth/pages/RegisterPage';
import RecoverPage from './features/auth/pages/RecoverPage';
import WorkspacePage from './features/workspace/pages/WorkspacePage';

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Routes>
        {/* Гостевые страницы */}
        <Route element={<OnlyGuests />}>
          <Route element={<LayoutProvider />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/recover" element={<RecoverPage />} />
          </Route>
        </Route>

        {/* Приватные страницы */}
        <Route element={<RequireAuth />}>
          <Route element={<LayoutProvider />}>
            <Route path="/" element={<WorkspacePage />} />
          </Route>
        </Route>
      </Routes>
    </ThemeProvider>
  );
};

export default App;