// src/guards.tsx
import React, { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from './AuthContext';

/**
 * Доступ только для авторизованных (есть серверная сессия).
 * PIN блокировка обрабатывается оверлеем, а не роутером.
 */
export const RequireAuth: React.FC = () => {
  const { loading, hasSession } = useContext(AuthContext);

  if (loading) return null;

  if (!hasSession) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

/**
 * Гостевые страницы (логин/регистрация/восстановление).
 * Если есть сессия — уводим внутрь.
 */
export const OnlyGuests: React.FC = () => {
  const { loading, hasSession } = useContext(AuthContext);

  if (loading) return null;

  if (hasSession) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};
