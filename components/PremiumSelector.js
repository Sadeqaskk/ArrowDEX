'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

/**
 * Premium chain/token selector — a styled dropdown with icon, name, and a
 * subtitle, replacing plain HTML <select> elements used elsewhere.
 *
 * Single-asset option: { key, label, sublabel, colorClass, logo, meta, disabledReason }
 * Pair option (e.g. a pool/pair switcher): add `pair: [{ symbol, color, logo? }, { symbol, color, logo? }]`
 *   `color` is a Tailwind gradient stop pair, e.g. 'from-[#5FE0A8] to-[#2FAE7E]'.
 *   When `pair` is present it takes priority over `logo`/`colorClass` and renders
 *   the overlapping coin-stack badge instead of a single dot.
 */

const SEARCH_THRESHOLD = 7; // only show the filter input once a list gets long enough to need it

// One coin — glossy gradient fill, faint top highlight, hairline ring. Used
// standalone for single-asset options and stacked (via PairAvatar) for pairs.
function Coin({ symbol, color, logo, size = 28, ring = true, className = '' }) {
  const dim = { width: size, height: size };
  if (logo) {
    return (
      <span
        className={`relative flex-shrink-0 rounded-full overflow-hidden ${ring ? 'ring-1 ring-white/10' : ''} ${className}`}
        style={dim}
      >
        <img src={logo} alt={symbol || ''} className="w-full h-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={`relative flex-shrink-0 rounded-full bg-gradient-to-br ${color || 'from-indigo-bright to-laser'} flex items-center justify-center ${ring ? 'ring-1 ring-white/10' : ''} ${className}`}
      style={dim}
    >
      {/* glossy top-left highlight — what separates a "coin" from a flat dot */}
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.35) 0%, transparent 45%)' }}
      />
      {symbol && (
        <span
          className="relative font-extrabold text-white leading-none select-none"
          style={{ fontSize: Math.max(9, size * 0.4), textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
        >
          {symbol.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

// Two coins overlapping — the "coin stack" pair badge every serious AMM
// selector uses in place of a single generic icon.
function PairAvatar({ pair, size = 28 }) {
  const [a, b] = pair;
  return (
    <span className="relative flex-shrink-0 flex items-center" style={{ width: size * 1.62, height: size }}>
      <Coin {...a} size={size} className="absolute left-0 top-0 z-0 shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />
      <span
        className="absolute z-10 rounded-full"
        style={{
          left: size * 0.62 - 2,
          top: -2,
          width: size + 4,
          height: size + 4,
          background: 'radial-gradient(circle, rgba(10,10,16,1) 60%, rgba(10,10,16,0) 72%)',
        }}
      />
      <Coin {...b} size={size} className="absolute z-20 shadow-[0_2px_6px_rgba(0,0,0,0.35)]" style={{ left: size * 0.62 }} />
    </span>
  );
}

function OptionIcon({ option, size = 28 }) {
  if (option?.pair?.length === 2) {
    return <PairAvatar pair={option.pair} size={size} />;
  }
  return <Coin symbol={option?.label} color={option?.colorClass} logo={option?.logo} size={size} />;
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
      <div className={`relative rounded-full p-[1px] transition-all duration-300 ${open ? 'bg-gradient-to-r from-indigo-bright/60 via-violetglow/50 to-indigo-bright/60' : 'bg-white/[0.06]'}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`relative flex items-center gap-2.5 rounded-full pl-2 pr-3.5 py-2 transition-colors ${open ? 'bg-[#0E0E16]' : 'bg-white/[0.035] hover:bg-white/[0.06]'}`}
        >
          <OptionIcon option={selected} size={30} />
          <div className="text-left leading-tight">
            <span className="text-[14px] font-bold text-ivory tracking-tight block">{selected?.label}</span>
            {selected?.sublabel && (
              <span className="text-[10px] text-dim/70 tracking-wide block -mt-0.5">{selected.sublabel}</span>
            )}
          </div>
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`w-3.5 h-3.5 text-dim transition-transform duration-300 ${open ? 'rotate-180 text-indigo-bright' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          role="listbox"
          className="absolute top-[calc(100%+8px)] left-0 z-30 min-w-[260px] max-w-[340px] bg-[#0E0E16]/95 backdrop-blur-xl border border-white/[0.08] rounded-[18px] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75)] overflow-hidden py-1.5 origin-top animate-selector-in"
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
              const isSelected = o.key === value;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isDisabled}
                  title={isDisabled ? o.disabledReason : undefined}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => selectOption(o)}
                  className={`relative w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isDisabled
                      ? 'opacity-30 cursor-not-allowed'
                      : isSelected
                      ? 'bg-indigo-bright/[0.08]'
                      : isActive
                      ? 'bg-white/[0.05]'
                      : ''
                  }`}
                >
                  {isSelected && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-gradient-to-b from-indigo-bright to-violetglow" />
                  )}
                  <OptionIcon option={o} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold flex items-center gap-2">
                      <span className="truncate text-ivory">{o.label}</span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-indigo-bright/15 ring-1 ring-indigo-bright/40 flex items-center justify-center flex-shrink-0">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-2.5 h-2.5 text-indigo-bright">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </span>
                      )}
                    </div>
                    {o.sublabel && <div className="text-[11px] text-dim truncate mt-0.5">{o.sublabel}</div>}
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