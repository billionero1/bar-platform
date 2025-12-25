import React from 'react';
import { useLayoutCtx } from '../../../../shared/ui/LayoutProvider';

import RegisterMobile from './Register.mobile';
import RegisterDesktop from './Register.desktop';

const Register: React.FC = () => {
  const layout = useLayoutCtx();

  if (layout === 'mobile') return <RegisterMobile />;
  // tablet пока = desktop
  return <RegisterDesktop />;
};

export default Register;
