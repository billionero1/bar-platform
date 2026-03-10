import React, { createContext, useContext, useMemo } from 'react';
import type { Layout } from './breakpoints';
import { useLayout } from './useLayout';

const LayoutCtx = createContext<Layout>('desktop');

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const layout = useLayout();
  const value = useMemo(() => layout, [layout]);

  return <LayoutCtx.Provider value={value}>{children}</LayoutCtx.Provider>;
}

export function useLayoutCtx(): Layout {
  return useContext(LayoutCtx);
}
