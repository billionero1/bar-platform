// src/guards.tsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Outlet/> : <Navigate to="/login" replace />;
}

export function RequireRole({ role }: { role: 'manager'|'staff' }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return user.role === role ? <Outlet/> : <Navigate to="/" replace />;
}
