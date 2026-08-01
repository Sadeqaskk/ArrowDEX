'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { searchAll } from '../lib/searchIndex';
import SearchResultsList from './SearchResultsList';

export default function MobileSearchModal({ open, onClose }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  const results = query.trim() ? searchAll(query) : null;

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function handleSelectPage(href) {
    router.push(href);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute top-0 left-0 right-0 bg-[#0A0A10] border-b border-white/10 max-h-[85vh] flex flex-col">
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
          <button onClick={onClose} className="text-dim flex-shrink-0" aria-label="Close search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto py-1.5">
          {query.trim() ? (
            <SearchResultsList query={query} results={results} onSelectPage={handleSelectPage} onClose={onClose} />
          ) : (
            <div className="px-4 py-8 text-sm text-dim text-center">Start typing to search pages, tokens, or networks.</div>
          )}
        </div>
      </div>
    </div>
  );
}