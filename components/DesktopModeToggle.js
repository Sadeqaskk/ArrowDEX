'use client';

import { useDesktopMode } from './DesktopModeContext';

export default function DesktopModeToggle({ variant = 'row' }) {
  const { desktopMode, toggleDesktopMode, isMobile } = useDesktopMode();

  // Only meaningful on a phone-width screen — on a real tablet/laptop the
  // desktop layout is already what's showing, so the toggle would do nothing.
  if (!isMobile) return null;

  if (variant === 'button') {
    return (
      <button
        onClick={toggleDesktopMode}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-[14px] text-[14.5px] font-semibold text-dim hover:text-ivory hover:bg-white/[0.03] transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        {desktopMode ? 'Switch to Mobile View' : 'Switch to Desktop View'}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-white/5">
      <div className="min-w-0">
        <div className="text-sm font-medium">Desktop view</div>
        <div className="text-xs text-dim mt-0.5">See the full desktop layout, scaled to fit your screen</div>
      </div>
      <button
        onClick={toggleDesktopMode}
        className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${desktopMode ? 'bg-indigo' : 'bg-white/10'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${desktopMode ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}