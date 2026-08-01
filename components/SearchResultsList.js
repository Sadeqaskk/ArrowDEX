'use client';

import { CHAIN_LIST } from '../lib/chains';

export default function SearchResultsList({ query, results, onSelectPage, onClose }) {
  if (!results) return null;
  const hasResults = results.pages.length || results.tokens.length || results.chains.length || results.address;

  if (!hasResults) {
    return <div className="px-4 py-6 text-sm text-dim text-center">No matches for &quot;{query}&quot;</div>;
  }

  return (
    <>
      {results.address && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-dim font-semibold">Address</div>
          {CHAIN_LIST.map((c) => (
            <a
              key={c.key}
              href={`${c.explorer}/address/${results.address}`}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left"
            >
              <span className="w-8 h-8 rounded-full bg-indigo/15 text-indigo-bright flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">View on {c.name} Explorer</div>
                <div className="text-[11px] text-dim font-mono truncate">{results.address}</div>
              </div>
            </a>
          ))}
        </div>
      )}

      {results.pages.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-dim font-semibold">Pages</div>
          {results.pages.map((p) => (
            <button
              key={p.href + p.label}
              onClick={() => onSelectPage(p.href)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left"
            >
              <span className="w-8 h-8 rounded-full bg-indigo/10 text-indigo-bright flex items-center justify-center flex-shrink-0">
                <span className="w-4 h-4">{p.icon}</span>
              </span>
              <div className="text-sm font-bold">{p.label}</div>
            </button>
          ))}
        </div>
      )}

      {results.tokens.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-dim font-semibold">Tokens</div>
          {results.tokens.map((t) => (
            <button
              key={t.symbol}
              onClick={() => !t.disabled && onSelectPage('/swap')}
              disabled={t.disabled}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${t.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/[0.04]'}`}
            >
              {t.logo ? (
                <img src={t.logo} alt={t.symbol} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <span className={`w-8 h-8 rounded-full bg-gradient-to-br ${t.color || 'from-indigo-bright to-laser'} flex-shrink-0`} />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold flex items-center gap-2">
                  {t.symbol}
                  {t.disabled && <span className="text-[10px] font-semibold text-dim bg-white/5 px-1.5 py-0.5 rounded">Soon</span>}
                </div>
                <div className="text-[11px] text-dim truncate">{t.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {results.chains.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-dim font-semibold">Networks</div>
          {results.chains.map((c) => (
 <a           
              key={c.key}
              href={c.explorer}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left"
            >
              <span className="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
                {c.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">{c.name}</div>
                <div className="text-[11px] text-dim font-mono">Chain ID {c.chainId}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}