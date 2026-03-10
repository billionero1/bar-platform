import { useEffect, useState } from 'react';
import type { Layout } from './breakpoints';
import { media } from './breakpoints';

function getLayoutNow(): Layout {
  if (typeof window === 'undefined') return 'desktop';
  if (window.matchMedia(media.mobile).matches) return 'mobile';
  if (window.matchMedia(media.tablet).matches) return 'tablet';
  return 'desktop';
}

export function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>(() => getLayoutNow());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mMobile = window.matchMedia(media.mobile);
    const mTablet = window.matchMedia(media.tablet);
    const mDesktop = window.matchMedia(media.desktop);

    const onChange = () => setLayout(getLayoutNow());

    const sub = (m: MediaQueryList) => {
      // iOS/Safari fallback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyM = m as any;
      if (typeof anyM.addEventListener === 'function') anyM.addEventListener('change', onChange);
      else if (typeof anyM.addListener === 'function') anyM.addListener(onChange);

      return () => {
        if (typeof anyM.removeEventListener === 'function') anyM.removeEventListener('change', onChange);
        else if (typeof anyM.removeListener === 'function') anyM.removeListener(onChange);
      };
    };

    const unsub = [sub(mMobile), sub(mTablet), sub(mDesktop)];
    return () => unsub.forEach((fn) => fn());
  }, []);

  return layout;
}
