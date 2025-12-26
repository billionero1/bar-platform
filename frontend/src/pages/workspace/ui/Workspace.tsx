import React from 'react';
import { useLayoutCtx } from '../../../shared/ui/LayoutProvider';

import WorkspaceMobile from './Workspace.mobile';
import WorkspaceDesktop from './Workspace.desktop';

const Workspace: React.FC = () => {
  const layout = useLayoutCtx();

  if (layout === 'mobile') return <WorkspaceMobile />;
  // tablet пока = desktop
  return <WorkspaceDesktop />;
};

export default Workspace;
