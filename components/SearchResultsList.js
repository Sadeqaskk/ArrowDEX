'use client';

import { CHAIN_LIST } from '../lib/chains';

const CHAIN_LOGOS = {
  arcTestnet: '/fonts/chains/arc.png',
  ethereumSepolia: '/fonts/chains/ethereum.png',
  baseSepolia: '/fonts/chains/base.png',
};

// Single source of truth for "what are the selectable rows, in order" — used
// by SearchBar for keyboard navigation and by this component for rendering,
// so the two never drift out of sync.
export function buildFlatItems(results, { onSelectPage } = {}) {
  if (!results) return [];
  const items = [];

  if (results.address) {
    CHAIN_LIST.forEach((c) => {
      items.push({
        id: `addr-${c.key}`,
        kind: 'address',
        chain: c,
        activate: () => window.open(`${c.explorer}/address/${results.address}`, '_blank', 'noopener'),
      });
    });
  }
  (results.pages || []).forEach((p) => {
    items.push({ id: `page-${p.href}`, kind: 'page', page: p, activate: () => onSelectPage?.(p.href, p) });
  });
  (results.tokens || []).forEach((t) => {
    items.push({
      id: `token-${t.symbol}`,
      kind: 'token',
      token: t,
      disabled: t.disabled,
      activate: () => { if (!t.disabled) onSelectPage?.('/swap', t); },
    });
  });
  (results.chains || []).forEach((c) => {
    items.push({ id: `chain-${c.key}`, kind: 'chain', chain: c, activate: () => window.open(c.explorer, '_blank', 'noopener') });
  });

  return items;
}

// Bold the portion of `text` matching `query`, case-insensitive — small
// touch, but it's the difference between a search box and a filtered list.
function Highlight({ text, query }) {
  if (!query?.trim()) return text;
  const i = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-indigo-bright">{text.slice(i, i + query.trim().length)}</span>
      {text.slice(i + query.trim().length)}
    </>
  );
}

function Row({ active, disabled, onMouseEnter, onClick, children }) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onClick={disabled ? undefined : onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
    >
      {children}
    </div>
  );
}

export default function SearchResultsList({ query, results, onSelectPage, onClose, activeIndex = -1, onHoverIndex }) {
  if (!results) return null;
  const hasResults = results.pages.length || results.tokens.length || results.chains.length || results.address;

  if (!hasResults) {
    return (
      <div className="text-center py-10 px-6">
        <div className="w-9 h-9 rounded-full bg-white/5 text-dim flex items-center justify-center mx-auto mb-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
        </div>
        <div className="text-sm text-dim">No matches for &quot;{query}&quot;</div>
      </div>
    );
  }

  let idx = -1;
  const next = () => { idx += 1; return idx; };
  const flat = buildFlatItems(results, { onSelectPage });

  function fire(i) {
    flat[i]?.activate();
    onClose?.();
  }

  return (
    <>
      {results.address && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-dim font-semibold">Address</div>
          {CHAIN_LIST.map((c) => {
            const i = next();
            return (
              <Row key={c.key} active={i === activeIndex} onMouseEnter={() => onHoverIndex?.(i)} onClick={() => fire(i)}>
                <span className="w-8 h-8 rounded-full bg-indigo/15 text-indigo-bright flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">View on {c.name} Explorer</div>
                  <div className="text-[11px] text-dim font-mono truncate">{results.address}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(results.address); }}
                  title="Copy address"
                  className="text-[11px] text-dim hover:text-ivory flex-shrink-0 px-2 py-1 rounded-md hover:bg-white/5"
                >
                  Copy
                </button>
              </Row>
            );
          })}
        </div>
      )}

      {results.pages.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-dim font-semibold">Pages</div>
          {results.pages.map((p) => {
            const i = next();
            return (
              <Row key={p.href + p.label} active={i === activeIndex} onMouseEnter={() => onHoverIndex?.(i)} onClick={() => fire(i)}>
                <span className="w-8 h-8 rounded-full bg-indigo/10 text-indigo-bright flex items-center justify-center flex-shrink-0">
                  <span className="w-4 h-4">{p.icon}</span>
                </span>
                <div className="text-sm font-bold"><Highlight text={p.label} query={query} /></div>
              </Row>
            );
          })}
        </div>
      )}

      {results.tokens.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-dim font-semibold">Tokens</div>
          {results.tokens.map((t) => {
            const i = next();
            return (
              <Row key={t.symbol} active={i === activeIndex} disabled={t.disabled} onMouseEnter={() => onHoverIndex?.(i)} onClick={() => fire(i)}>
                {t.logo ? (
                  <img src={t.logo} alt={t.symbol} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className={`w-8 h-8 rounded-full bg-gradient-to-br ${t.color || 'from-indigo-bright to-laser'} flex-shrink-0`} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold flex items-center gap-2">
                    <Highlight text={t.symbol} query={query} />
                    {t.disabled && <span className="text-[10px] font-semibold text-dim bg-white/5 px-1.5 py-0.5 rounded">Soon</span>}
                  </div>
                  <div className="text-[11px] text-dim truncate"><Highlight text={t.name} query={query} /></div>
                </div>
              </Row>
            );
          })}
        </div>
      )}

      {results.chains.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-dim font-semibold">Networks</div>
          {results.chains.map((c) => {
            const i = next();
            const logo = CHAIN_LOGOS[c.key];
            return (
              <Row key={c.key} active={i === activeIndex} onMouseEnter={() => onHoverIndex?.(i)} onClick={() => fire(i)}>
                {logo ? (
                  <img src={logo} alt={c.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold"><Highlight text={c.name} query={query} /></div>
                  <div className="text-[11px] text-dim font-mono">Chain ID {c.chainId}</div>
                </div>
              </Row>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-4 px-4 py-2.5 mt-1 border-t border-white/5 text-[10.5px] text-dim/70">
        <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/5 font-mono">↑↓</kbd> navigate</span>
        <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/5 font-mono">↵</kbd> select</span>
        <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/5 font-mono">esc</kbd> close</span>
      </div>
    </>
  );
}