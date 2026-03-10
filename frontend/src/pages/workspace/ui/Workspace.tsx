import React from 'react';
import { useLayoutCtx } from '../../../shared/ui/LayoutProvider';

import WorkspaceMobile from './Workspace.mobile';
import WorkspaceDesktop from './Workspace.desktop';
import WorkspaceShell from './WorkspaceShell';

const Workspace: React.FC = () => {
  const layout = useLayoutCtx();

  if (layout === 'mobile') return <WorkspaceMobile />;
  if (layout === 'tablet') return <WorkspaceShell layout="tablet" />;
  return <WorkspaceDesktop />;
};

export default Workspace;
