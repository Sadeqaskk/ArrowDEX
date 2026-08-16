'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { searchAll } from '../lib/searchIndex';
import SearchResultsList, { buildFlatItems } from './SearchResultsList';
import { NAV_ITEMS } from './Sidebar';

const RECENTS_KEY = 'arrowdex:recent-searches';
const RECENTS_MAX = 5;

function loadRecents() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENTS_KEY) || '[]');
  } catch { return []; }
}

function pushRecent(entry) {
  if (typeof window === 'undefined') return [];
  const existing = loadRecents().filter((r) => r.href !== entry.href);
  const next = [entry, ...existing].slice(0, RECENTS_MAX);
  try { window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export default function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recents, setRecents] = useState([]);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const results = query.trim() ? searchAll(query) : null;

  const handleSelectPage = useCallback((href, meta) => {
    const label = meta?.label || meta?.symbol || href;
    setRecents(pushRecent({ href, label }));
    router.push(href);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  }, [router]);

  const flatItems = useMemo(
    () => (results ? buildFlatItems(results, { onSelectPage: handleSelectPage }) : []),
    [results, handleSelectPage]
  );

  useEffect(() => { setRecents(loadRecents()); }, []);
  useEffect(() => { setActiveIndex(flatItems.length ? 0 : -1); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKey(e) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        return;
      }
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        return;
      }
      if (document.activeElement !== inputRef.current) return;

      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      } else if (e.key === 'ArrowDown' && flatItems.length) {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % flatItems.length);
      } else if (e.key === 'ArrowUp' && flatItems.length) {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
      } else if (e.key === 'Enter' && activeIndex >= 0 && flatItems[activeIndex]) {
        e.preventDefault();
        flatItems[activeIndex].activate();
        setQuery('');
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [flatItems, activeIndex]);

  function selectRecent(r) {
    router.push(r.href);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  }

  const showRecents = open && !query.trim() && recents.length > 0;

  return (
    <div className="relative" ref={rootRef}>
      <div className="flex items-center gap-2.5 bg-white/[0.025] border border-white/5 focus-within:border-indigo-bright/40 rounded-xl px-[18px] py-[11px] text-dim text-[13.5px] min-w-[340px] transition-colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[15px] h-[15px] opacity-60 flex-shrink-0">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search pages, tokens, networks, or paste an address…"
          className="bg-transparent outline-none w-full text-ivory placeholder:text-dim"
        />
        {query ? (
          <button onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="text-dim hover:text-ivory flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        ) : (
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10.5px] text-dim/70 bg-white/5 border border-white/5 rounded-md px-1.5 py-0.5 font-mono flex-shrink-0">
            {isMac ? '⌘' : 'Ctrl'}K
          </kbd>
        )}
      </div>

      {open && query.trim() && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-30 bg-[#0E0E16] border border-white/10 rounded-[16px] shadow-2xl shadow-black/60 overflow-hidden py-1.5 max-h-[440px] overflow-y-auto">
          <SearchResultsList
            query={query}
            results={results}
            onSelectPage={handleSelectPage}
            onClose={() => setOpen(false)}
            activeIndex={activeIndex}
            onHoverIndex={setActiveIndex}
          />
        </div>
      )}

      {showRecents && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-30 bg-[#0E0E16] border border-white/10 rounded-[16px] shadow-2xl shadow-black/60 overflow-hidden py-1.5">
          <div className="flex items-center justify-between px-4 pt-2 pb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-dim font-semibold">Recent</span>
            <button
              onClick={() => { try { window.localStorage.removeItem(RECENTS_KEY); } catch {} setRecents([]); }}
              className="text-[10.5px] text-dim hover:text-ivory transition-colors"
            >
              Clear
            </button>
          </div>
          {recents.map((r) => {
            const navItem = NAV_ITEMS.find((n) => n.href === r.href);
            return (
              <button
                key={r.href}
                onClick={() => selectRecent(r)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
              >
                <span className="w-7 h-7 rounded-full bg-white/[0.04] text-dim flex items-center justify-center flex-shrink-0">
                  {navItem ? (
                    <span className="w-3.5 h-3.5">{navItem.icon}</span>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                  )}
                </span>
                <span className="text-sm font-semibold text-ivory">{r.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}