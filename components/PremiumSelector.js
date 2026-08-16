'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

/**
 * Premium chain/token selector — a styled dropdown with icon, name, and a
 * subtitle, replacing plain HTML <select> elements used elsewhere.
 *
 * options: [{ key, label, sublabel, colorClass, logo, meta, disabledReason }]
 */

const SEARCH_THRESHOLD = 7; // only show the filter input once a list gets long enough to need it

function OptionIcon({ option, className }) {
  if (option?.logo) {
    return <img src={option.logo} alt={option.label} className={`${className} object-cover flex-shrink-0`} />;
  }
  return <span className={`${className} rounded-full bg-gradient-to-br ${option?.colorClass || 'from-indigo-bright to-laser'} flex-shrink-0`} />;
}

export default function PremiumSelector({ options, value, onChange, disabledKeys = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const selected = options.find((o) => o.key === value);
  const searchable = options.length > SEARCH_THRESHOLD;

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }, [options, query, searchable]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setActiveIndex(Math.max(0, filtered.findIndex((o) => o.key === value)));
      if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function selectOption(o) {
    if (!o || disabledKeys.includes(o.key)) return;
    onChange(o.key);
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
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectOption(filtered[activeIndex]);
    }
  }

  return (
    <div className="relative" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
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
        <div
          role="listbox"
          className="absolute top-[calc(100%+8px)] left-0 z-30 min-w-[240px] max-w-[320px] bg-[#0E0E16] border border-white/10 rounded-[16px] shadow-2xl shadow-black/60 overflow-hidden py-1.5 origin-top animate-selector-in"
        >
          {searchable && (
            <div className="px-2.5 pb-1.5 mb-0.5 border-b border-white/5">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                placeholder="Search…"
                className="w-full bg-white/[0.03] rounded-[9px] px-3 py-2 text-[13px] outline-none placeholder:text-dim/50"
              />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-[12px] text-dim">No matches</div>
            )}
            {filtered.map((o, i) => {
              const isDisabled = disabledKeys.includes(o.key);
              const isActive = i === activeIndex;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={o.key === value}
                  disabled={isDisabled}
                  title={isDisabled ? o.disabledReason : undefined}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => selectOption(o)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isDisabled
                      ? 'opacity-30 cursor-not-allowed'
                      : o.key === value
                      ? 'bg-indigo/10'
                      : isActive
                      ? 'bg-white/[0.05]'
                      : ''
                  }`}
                >
                  <OptionIcon option={o} className="w-8 h-8 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold flex items-center gap-2">
                      <span className="truncate">{o.label}</span>
                      {o.key === value && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3 text-indigo-bright flex-shrink-0"><path d="M20 6L9 17l-5-5" /></svg>
                      )}
                    </div>
                    {o.sublabel && <div className="text-[11px] text-dim truncate">{o.sublabel}</div>}
                  </div>
                  {o.meta && <div className="text-[11px] text-dim font-mono flex-shrink-0">{o.meta}</div>}
                </button>
              );
            })}
          </div>
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