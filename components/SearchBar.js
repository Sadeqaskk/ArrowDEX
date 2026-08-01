'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { searchAll } from '../lib/searchIndex';
import SearchResultsList from './SearchResultsList';

export default function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const results = query.trim() ? searchAll(query) : null;

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  function handleSelectPage(href) {
    router.push(href);
    setQuery('');
    setOpen(false);
  }

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
        {query && (
          <button onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="text-dim hover:text-ivory flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-30 bg-[#0E0E16] border border-white/10 rounded-[16px] shadow-2xl shadow-black/60 overflow-hidden py-1.5 max-h-[420px] overflow-y-auto">
          <SearchResultsList query={query} results={results} onSelectPage={handleSelectPage} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}