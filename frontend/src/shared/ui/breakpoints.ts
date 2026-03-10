export type Layout = 'mobile' | 'tablet' | 'desktop';

export const BREAKPOINTS = {
  mobileMax: 767,
  tabletMax: 1023,
} as const;

export const media = {
  mobile: `(max-width: ${BREAKPOINTS.mobileMax}px)`,
  tablet: `(min-width: ${BREAKPOINTS.mobileMax + 1}px) and (max-width: ${BREAKPOINTS.tabletMax}px)`,
  desktop: `(min-width: ${BREAKPOINTS.tabletMax + 1}px)`,
} as const;
