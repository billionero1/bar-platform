import React from 'react';
import { useLayoutCtx } from '../../../../shared/ui/LayoutProvider';

import RecoverPasswordMobile from './RecoverPassword.mobile';
import RecoverPasswordDesktop from './RecoverPassword.desktop';

const RecoverPassword: React.FC = () => {
  const layout = useLayoutCtx();

  if (layout === 'mobile') return <RecoverPasswordMobile />;
  // tablet пока = desktop
  return <RecoverPasswordDesktop />;
};

export default RecoverPassword;
