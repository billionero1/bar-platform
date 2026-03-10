// src/pages/auth/AuthShell.tsx
import React from 'react';
import { useLayoutCtx } from '../../../../shared/ui/LayoutProvider';

import AuthShellMobile from './AuthShell.mobile';
import AuthShellTablet from './AuthShell.tablet';
import AuthShellDesktop from './AuthShell.desktop';

const AuthShell: React.FC = () => {
  const layout = useLayoutCtx();

  if (layout === 'mobile') return <AuthShellMobile />;
  if (layout === 'tablet') return <AuthShellTablet />;
  return <AuthShellDesktop />;
};

export default AuthShell;
