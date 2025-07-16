/* src/App.tsx */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';

import { AuthProvider, useAuth } from './AuthContext';

/* UI-рамка: фикс-хедер и новый футер */
import Header from './components/Header';
import Footer from './components/Footer';

/* Страницы */
import Login            from './pages/Login';
import Register         from './pages/Register';
import MainPage         from './pages/MainPage';
import IngredientsPage  from './pages/IngredientsPage';
import PreparationsPage from './pages/Preparations';
import PreparationForm  from './pages/PreparationForm';
import TeamPage         from './pages/TeamPage';
import TeamFormPage     from './pages/TeamForm';
import MainCalcPage     from './pages/MainCalcPage';
import InviteComplete   from './pages/InviteComplete';
import TtkPage          from './pages/TtkPage';      // ← заглушка для ТТК
import LearnPage        from './pages/LearnPage';    // ← заглушка для обучалки
import SettingsPage     from './pages/SettingsPage'; // ← заглушка для настроек

/* ---------- guard ---------- */
function Protected({
  children,
  adminOnly = false,
}: {
  children : ReactElement;
  adminOnly?: boolean;
}) {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated)          return <Navigate to="/"     replace />;
  if (adminOnly && !isAdmin)     return <Navigate to="/main" replace />;
  return children;
}

/* ---------- «оболочка» приложения ---------- */
function Shell() {
  const { isAuthenticated } = useAuth();

  return (
    <>
      {/* Шапка */}
      <Header />

      {/* Контент с учётом высоты шапки */}
      <main className={isAuthenticated ? 'pt-14' : ''}>
        <Routes>
          {/* Публичные */}
          <Route path="/"            element={<Login          />} />
          <Route path="/register"    element={<Register       />} />
          <Route path="/invite/:token" element={<InviteComplete />} />

          {/* Авторизованным */}
          <Route path="/main" element={
            <Protected><MainPage/></Protected>
          }/>

          {/* Админ: ингредиенты */}
          <Route path="/ingredients" element={
            <Protected adminOnly><IngredientsPage/></Protected>
          }/>

          {/* Админ: заготовки */}
          <Route path="/preparations" element={
            <Protected adminOnly><PreparationsPage/></Protected>
          }/>
          <Route path="/preparations/new" element={
            <Protected adminOnly><PreparationForm/></Protected>
          }/>
          <Route path="/preparations/:id" element={
            <Protected adminOnly><PreparationForm/></Protected>
          }/>

          {/* Админ: команда */}
          <Route path="/team" element={
            <Protected adminOnly><TeamPage/></Protected>
          }/>
          <Route path="/team/new" element={
            <Protected adminOnly><TeamFormPage/></Protected>
          }/>
          <Route path="/team/:id" element={
            <Protected adminOnly><TeamFormPage/></Protected>
          }/>

          {/* Остальные: калькулятор */}
          <Route path="/main/:id" element={
            <Protected><MainCalcPage/></Protected>
          }/>

          {/* Заглушка TTK */}
          <Route path="/ttk" element={
            <Protected><TtkPage/></Protected>
          }/>

          {/* Заглушка «Обучалки» */}
          <Route path="/learn" element={
            <Protected><LearnPage/></Protected>
          }/>

          {/* Заглушка «Настройки» */}
          <Route path="/settings" element={
            <Protected><SettingsPage/></Protected>
          }/>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Футер */}
      {isAuthenticated && <Footer />}
    </>
  );
}

/* ---------- root ---------- */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}
