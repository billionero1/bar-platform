// src/features/auth/pages/LoginPage.tsx
import React from 'react';
import { useLayout } from '../../../hooks/layout/useLayout';
import LoginPageMobile from './mobile/LoginPage.mobile';
import LoginPageTablet from './tablet/LoginPage.tablet';
import LoginPageDesktop from './desktop/LoginPage.desktop';

const LoginPage: React.FC = () => {
  const layout = useLayout();

  switch (layout) {
    case 'mobile':
      return <LoginPageMobile />;
    case 'tablet':
      return <LoginPageTablet />;
    case 'desktop':
    default:
      return <LoginPageDesktop />;
  }
};

export default LoginPage;