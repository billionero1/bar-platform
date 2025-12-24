// src/guards.tsx
import React, { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from './AuthContext';

/**
 * Доступ только для авторизованных (есть серверная сессия).
 */
export const RequireAuth: React.FC = () => {
  const { loading, hasSession, isCsrfReady } = useContext(AuthContext);

  // Показываем null во время загрузки
  if (loading) return null;

  // Если CSRF не готов, но сессия есть - все равно пускаем
  // CSRF ошибки будут обработаны на уровне API
  if (!hasSession) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

/**
 * Гостевые страницы (логин/регистрация/восстановление).
 */
export const OnlyGuests: React.FC = () => {
  const { loading, hasSession } = useContext(AuthContext);

  if (loading) return null;

  if (hasSession) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};