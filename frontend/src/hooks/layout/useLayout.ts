// src/hooks/layout/useLayout.ts
import { useState, useEffect } from 'react';

export type LayoutType = 'mobile' | 'tablet' | 'desktop';

const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
} as const;

export const useLayout = (): LayoutType => {
  const [layout, setLayout] = useState<LayoutType>('desktop');

  useEffect(() => {
    const determineLayout = () => {
      const width = window.innerWidth;
      if (width < BREAKPOINTS.mobile) {
        return 'mobile';
      } else if (width < BREAKPOINTS.tablet) {
        return 'tablet';
      }
      return 'desktop';
    };

    const updateLayout = () => {
      setLayout(determineLayout());
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  return layout;
};