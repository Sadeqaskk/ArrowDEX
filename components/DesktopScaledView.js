'use client';

import { useRef, useState, useLayoutEffect } from 'react';

const DESKTOP_WIDTH = 1280; // matches the app's effective desktop design width

/**
 * When `active`, renders children at a fixed DESKTOP_WIDTH and scales the
 * whole thing down (CSS transform) to fit the real, narrow viewport width —
 * exactly what OKX/Binance's "Desktop site" toggle does on mobile web.
 * The wrapper's own height is kept in sync with the *scaled* content height
 * via ResizeObserver, so the page never leaves dead space or clips content.
 *
 * When `active` is false, this is a transparent passthrough — real desktop/
 * tablet viewports render the exact same children with zero transform, so
 * "desktop mode on a phone" and "actually on a laptop" are the same code
 * path, not two different implementations to keep in sync.
 */
export default function DesktopScaledView({ active, children }) {
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);

  useLayoutEffect(() => {
    if (!active) return;

    function measure() {
      const s = window.innerWidth / DESKTOP_WIDTH;
      setScale(s);
      if (contentRef.current) {
        setContentHeight(contentRef.current.scrollHeight);
      }
    }
    measure();

    const ro = new ResizeObserver(measure);
    if (contentRef.current) ro.observe(contentRef.current);
    window.addEventListener('resize', measure);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [active]);

  if (!active) return <>{children}</>;

  return (
    <div style={{ width: '100%', height: contentHeight * scale, overflow: 'hidden' }}>
      <div
        ref={contentRef}
        style={{
          width: DESKTOP_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}