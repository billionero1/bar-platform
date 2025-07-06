/* src/App.tsx */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';

import { AuthProvider, useAuth } from './AuthContext';

/* UI-рамка: фикс-хедер и выдвижное меню */
import Header     from './components/Header';
import MenuDrawer from './components/MenuDrawer';
import Footer     from './components/Footer';

/* Страницы */
import Login            from './pages/Login';
import Register         from './pages/Register';
import MainPage         from './pages/MainPage';
import IngredientsPage  from './pages/IngredientsPage';
import PreparationsPage from './pages/Preparations';

import TeamPage         from './pages/TeamPage';
import PreparationForm from './pages/PreparationForm';
import TeamFormPage from './pages/TeamForm';
import MainCalcPage from './pages/MainCalcPage';


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
      {/* Шапка монтируется всегда, внутри сама решит – рендериться ли (на login/register она скрыта) */}
      <Header />

      {/* Меню появляется только после входа */}
      {isAuthenticated && <MenuDrawer />}

      {/* <main> получает отступ только если фикс-хедер реально есть */}
      <main className={isAuthenticated ? 'pt-14' : ''}>
        <Routes>
          {/* Публичные */}
          <Route path="/"          element={<Login    />} />
          <Route path="/register"  element={<Register />} />

          {/* Всем авторизованным */}
          <Route path="/main" element={
            <Protected><MainPage/></Protected>
          }/>


          {/* Админ-зона */}
          <Route path="/ingredients" element={
            <Protected adminOnly><IngredientsPage/></Protected>
          }/>
          <Route path="/preparations" element={
            <Protected adminOnly><PreparationsPage/></Protected>
          }/>
          <Route path="/preparations/new" element={
            <Protected adminOnly><PreparationForm /></Protected>
          } />
          <Route path="/preparations/:id" element={
            <Protected adminOnly><PreparationForm /></Protected>
          } />
          <Route path="/team" element={
            <Protected adminOnly><TeamPage/></Protected>
          }/>
          <Route path="/team/new" element={
            <Protected adminOnly><TeamFormPage /></Protected>
          }/>
          <Route path="/team/:id" element={
            <Protected adminOnly><TeamFormPage /></Protected>
          }/>

          <Route path="/main/:id" element={
            <Protected><MainCalcPage /></Protected>
          } />


          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Футер — отображается только если пользователь авторизован и не на странице login */}
      {isAuthenticated && window.location.pathname !== "/login" && <Footer />}
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
