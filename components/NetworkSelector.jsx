'use client';

import { useEffect, useRef, useState } from 'react';
import { NETWORKS } from '../lib/networks';

export default function NetworkSelector({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);

  const active = NETWORKS.find((n) => n.id === value) || NETWORKS[0];

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) setActiveIndex(Math.max(0, NETWORKS.findIndex((n) => n.id === active.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function selectNetwork(n) {
    if (!n || n.disabled) return;
    onChange?.(n.id);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % NETWORKS.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + NETWORKS.length) % NETWORKS.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectNetwork(NETWORKS[activeIndex]);
    }
  }

  return (
    <div className="relative" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 bg-success/[0.07] border border-success/25 text-success text-xs font-medium px-4 py-[9px] rounded-full hover:bg-success/[0.11] transition-colors"
      >
        {active.logo ? (
          <img src={active.logo} alt={active.label} className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
        )}
        {active.label}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          className={`w-3 h-3 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-[calc(100%+8px)] w-[220px] glass rounded-[13px] p-1.5 z-50 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)] origin-top-right animate-selector-in"
        >
          {NETWORKS.map((n, i) => {
            const isActive = n.id === active.id;
            const isHighlighted = i === activeIndex;
            return (
              <button
                key={n.id}
                role="option"
                aria-selected={isActive}
                disabled={n.disabled}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => selectNetwork(n)}
                title={n.disabled ? 'Arc Mainnet is not live yet' : undefined}
                className={`w-full flex items-center justify-between px-3.5 py-[10px] rounded-[9px] text-[13px] font-medium text-left transition-colors ${
                  n.disabled
                    ? 'text-dim/60 cursor-not-allowed'
                    : isActive
                    ? 'text-indigo-bright bg-indigo/[0.12]'
                    : isHighlighted
                    ? 'text-ivory bg-white/[0.05]'
                    : 'text-ivory hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {n.logo ? (
                    <img src={n.logo} alt={n.label} className={`w-4 h-4 rounded-full object-cover flex-shrink-0 ${n.disabled ? 'opacity-40 grayscale' : ''}`} />
                  ) : (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        n.disabled ? 'bg-dim/40' : isActive ? 'bg-success shadow-[0_0_8px_currentColor] text-success' : 'bg-white/20'
                      }`}
                    />
                  )}
                  {n.label}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-[3px] rounded-full ${
                    n.disabled ? 'bg-white/5 text-dim' : 'bg-success/10 text-success'
                  }`}
                >
                  {n.tag}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <style jsx global>{`
        @keyframes selectorIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-selector-in { animation: selectorIn 0.14s ease-out; }
      `}</style>
    </div>
  );
}