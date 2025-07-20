// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import { AuthProvider, useAuth } from './AuthContext';

/* UI-рамка */
import Header from './components/Header';
import Footer from './components/Footer';

/* Страницы */
import Login            from './pages/Login';
import Register         from './pages/Register';
import MainPage         from './pages/MainPage';
import MainCalcPage     from './pages/MainCalcPage';
import IngredientsPage  from './pages/IngredientsPage';
import PreparationsPage from './pages/Preparations';
import PreparationForm  from './pages/PreparationForm';
import TeamPage         from './pages/TeamPage';
import TeamFormPage     from './pages/TeamForm';
import InviteComplete   from './pages/InviteComplete';
import AdminMenu        from './pages/AdminMenu';

import TtkPage      from './pages/TtkPage';
import LearnPage    from './pages/LearnPage';
import SettingsPage from './pages/SettingsPage';
import SandboxPage  from './pages/SandboxPage';
import ProfilePage  from './pages/ProfilePage';

function Protected({
  children,
  adminOnly = false,
}: {
  children: ReactElement;
  adminOnly?: boolean;
}) {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated)        return <Navigate to="/"     replace />;
  if (adminOnly && !isAdmin)   return <Navigate to="/main" replace />;
  return <>{children}</>;
}

function AppShell() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <main className={isAuthenticated ? 'pt-14 pb-[72px] flex-1 flex flex-col overflow-hidden' : ''}>

        <Routes>
          {/* публичные */}
          <Route path="/"              element={<Login />} />
          <Route path="/register"      element={<Register />} />
          <Route path="/invite/:token" element={<InviteComplete />} />

          {/* авторизованный */}
          <Route path="/main"     element={<Protected><MainPage /></Protected>} />
          <Route path="/main/:id" element={<Protected><MainCalcPage /></Protected>} />

          {/* админ */}
          <Route path="/ingredients"      element={<Protected adminOnly><IngredientsPage /></Protected>} />
          <Route path="/preparations"     element={<Protected adminOnly><PreparationsPage /></Protected>} />
          <Route path="/preparations/new" element={<Protected adminOnly><PreparationForm /></Protected>} />
          <Route path="/preparations/:id" element={<Protected adminOnly><PreparationForm /></Protected>} />
          <Route path="/team"             element={<Protected adminOnly><TeamPage /></Protected>} />
          <Route path="/team/new"         element={<Protected adminOnly><TeamFormPage /></Protected>} />
          <Route path="/team/:id"         element={<Protected adminOnly><TeamFormPage /></Protected>} />
          <Route path="/adminmenu"        element={<Protected adminOnly><AdminMenu /></Protected>} />

          {/* остальные */}
          <Route path="/ttk"      element={<Protected><TtkPage /></Protected>} />
          <Route path="/learn"    element={<Protected><LearnPage /></Protected>} />
          <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
          <Route path="/sandbox"  element={<Protected><SandboxPage /></Protected>} />
          <Route path="/profile"  element={<Protected><ProfilePage /></Protected>} />

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {isAuthenticated && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  );
}
