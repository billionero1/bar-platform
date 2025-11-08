import React, { useContext, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext } from './AuthContext';

import LoginPassword from './pages/LoginPassword';
import LoginPin from './pages/LoginPin';
import Register from './pages/Register';

// заглушка главной витрины — дальше подменим на реальную
function Home() {
  return <div className="page"><h2>Домашняя страница</h2><p>Калькулятор / Библиотека</p></div>;
}

function GuardedApp() {
  const { access, loading, needsPin, checkRefreshPresence } = useContext(AuthContext);

  useEffect(() => { void checkRefreshPresence(); }, [checkRefreshPresence]);

  if (loading) return <div className="page">Загрузка…</div>;
  if (needsPin && !access) return <Navigate to="/login/pin" replace />;
  if (!needsPin && !access) return <Navigate to="/login" replace />;

  return <Home />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GuardedApp />} />
      <Route path="/login" element={<LoginPassword />} />
      <Route path="/login/pin" element={<LoginPin />} />
      <Route path="/register" element={<Register />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
