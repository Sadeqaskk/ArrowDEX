'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useViewport } from './useViewport';

const STORAGE_KEY = 'arrowdex:desktop-mode';
const DesktopModeContext = createContext(null);

export function DesktopModeProvider({ children }) {
  const [desktopMode, setDesktopModeState] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const viewport = useViewport();

  useEffect(() => {
    try {
      setDesktopModeState(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch { /* storage unavailable — default stays off */ }
    setHydrated(true);
  }, []);

  const setDesktopMode = useCallback((value) => {
    setDesktopModeState(value);
    try { window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  const toggleDesktopMode = useCallback(() => {
    setDesktopMode(!desktopMode);
  }, [desktopMode, setDesktopMode]);

  // Real tablets/laptops already get the desktop layout naturally via
  // viewport width — this flag only matters for genuinely small (phone)
  // screens choosing to see the full layout anyway.
  const forced = hydrated && desktopMode && viewport.isMobile;

  return (
    <DesktopModeContext.Provider
      value={{
        desktopMode,
        setDesktopMode,
        toggleDesktopMode,
        forced,
        ...viewport,
      }}
    >
      {children}
    </DesktopModeContext.Provider>
  );
}

export function useDesktopMode() {
  const ctx = useContext(DesktopModeContext);
  if (!ctx) {
    // Fail soft if used outside the provider — behaves as "always mobile-native"
    return { desktopMode: false, setDesktopMode: () => {}, toggleDesktopMode: () => {}, forced: false, isMobile: false, isTablet: false, isDesktop: true, width: 1280 };
  }
  return ctx;
}