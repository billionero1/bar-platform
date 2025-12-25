import React from 'react';
import { useLayoutCtx } from '../../../../shared/ui/LayoutProvider';

import LoginMobile from './Login.mobile';
import LoginDesktop from './Login.desktop';

const Login: React.FC = () => {
  const layout = useLayoutCtx();

  if (layout === 'mobile') return <LoginMobile />;
  // tablet пока приравниваем к desktop (безопасно на старте)
  return <LoginDesktop />;
};

export default Login;
