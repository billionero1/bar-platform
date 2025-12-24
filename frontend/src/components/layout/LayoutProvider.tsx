// src/components/layout/LayoutProvider.tsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import { useLayout } from '../../hooks/layout/useLayout';
import MobileLayout from '../../layouts/Mobile/MobileLayout';
import TabletLayout from '../../layouts/Tablet/TabletLayout';
import DesktopLayout from '../../layouts/Desktop/DesktopLayout';

const LayoutProvider: React.FC = () => {
  const layout = useLayout();

  switch (layout) {
    case 'mobile':
      return (
        <MobileLayout>
          <Outlet />
        </MobileLayout>
      );
    case 'tablet':
      return (
        <TabletLayout>
          <Outlet />
        </TabletLayout>
      );
    case 'desktop':
    default:
      return (
        <DesktopLayout>
          <Outlet />
        </DesktopLayout>
      );
  }
};

export default LayoutProvider;