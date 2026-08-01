'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * Premium chain/token selector — a styled dropdown with icon, name, and a
 * subtitle, replacing plain HTML <select> elements used elsewhere.
 *
 * options: [{ key, label, sublabel, colorClass, logo }]
 */

function OptionIcon({ option, className }) {
  if (option?.logo) {
    return <img src={option.logo} alt={option.label} className={`${className} object-cover flex-shrink-0`} />;
  }
  return <span className={`${className} rounded-full bg-gradient-to-br ${option?.colorClass || 'from-indigo-bright to-laser'} flex-shrink-0`} />;
}

export default function PremiumSelector({ options, value, onChange, disabledKeys = [] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selected = options.find((o) => o.key === value);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 bg-white/[0.04] hover:bg-white/[0.07] border border-white/5 rounded-full pl-2 pr-3.5 py-2 transition-colors"
      >
        <OptionIcon option={selected} className="w-7 h-7 rounded-full" />
        <span className="text-[14px] font-bold">{selected?.label}</span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`w-3.5 h-3.5 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+8px)] left-0 z-30 min-w-[240px] bg-[#0E0E16] border border-white/10 rounded-[16px] shadow-2xl shadow-black/60 overflow-hidden py-1.5">
          {options.map((o) => {
            const isDisabled = disabledKeys.includes(o.key);
            return (
              <button
                key={o.key}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  onChange(o.key);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  isDisabled
                    ? 'opacity-30 cursor-not-allowed'
                    : o.key === value
                    ? 'bg-indigo/10'
                    : 'hover:bg-white/[0.04]'
                }`}
              >
                <OptionIcon option={o} className="w-8 h-8 rounded-full" />
                <div className="flex-1">
                  <div className="text-sm font-bold flex items-center gap-2">
                    {o.label}
                    {o.key === value && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3 text-indigo-bright"><path d="M20 6L9 17l-5-5" /></svg>
                    )}
                  </div>
                  {o.sublabel && <div className="text-[11px] text-dim">{o.sublabel}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}