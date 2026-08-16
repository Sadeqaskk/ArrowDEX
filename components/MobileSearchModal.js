'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { searchAll } from '../lib/searchIndex';
import SearchResultsList from './SearchResultsList';
import { NAV_ITEMS } from './Sidebar';

const RECENTS_KEY = 'arrowdex:recent-searches';

function loadRecents() {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; }
}

function pushRecent(entry) {
  if (typeof window === 'undefined') return [];
  const existing = loadRecents().filter((r) => r.href !== entry.href);
  const next = [entry, ...existing].slice(0, 5);
  try { window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export default function MobileSearchModal({ open, onClose }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState([]);
  const inputRef = useRef(null);

  const results = query.trim() ? searchAll(query) : null;

  useEffect(() => {
    if (open) {
      setQuery('');
      setRecents(loadRecents());
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  function handleSelectPage(href, meta) {
    setRecents(pushRecent({ href, label: meta?.label || meta?.symbol || href }));
    router.push(href);
    onClose();
  }

  function selectRecent(r) {
    router.push(r.href);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute top-0 left-0 right-0 bg-[#0A0A10] border-b border-white/10 max-h-[88vh] flex flex-col animate-sheet-down"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center gap-2.5 p-4 border-b border-white/5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-dim flex-shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, tokens, addresses…"
            className="bg-transparent outline-none w-full text-ivory placeholder:text-dim text-[15px]"
          />
          <button onClick={onClose} className="text-dim flex-shrink-0 active:scale-90 transition-transform" aria-label="Close search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto py-1.5">
          {query.trim() ? (
            <SearchResultsList query={query} results={results} onSelectPage={handleSelectPage} onClose={onClose} />
          ) : recents.length > 0 ? (
            <div>
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
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left"
                  >
                    <span className="w-8 h-8 rounded-full bg-white/[0.04] text-dim flex items-center justify-center flex-shrink-0">
                      {navItem ? <span className="w-4 h-4">{navItem.icon}</span> : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                      )}
                    </span>
                    <span className="text-sm font-semibold text-ivory">{r.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-sm text-dim text-center">Start typing to search pages, tokens, or networks.</div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sheetDown { from { transform: translateY(-16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-fade-in { animation: fadeIn 0.15s ease-out; }
        .animate-sheet-down { animation: sheetDown 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
}