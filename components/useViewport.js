'use client';

import { useState, useEffect } from 'react';

// Matches Tailwind's own md (768) / lg (1024) breakpoints exactly, so
// "isMobile" here always agrees with when md: classes stop applying —
// no more places where a JS check and a CSS breakpoint quietly disagree.
const BREAKPOINTS = { tablet: 768, desktop: 1024 };

export function useViewport() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  useEffect(() => {
    let raf = 0;
    function onResize() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    }
    window.addEventListener('resize', onResize);
    onResize();
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return {
    width,
    isMobile: width < BREAKPOINTS.tablet,
    isTablet: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
    isDesktop: width >= BREAKPOINTS.desktop,
  };
}