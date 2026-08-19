'use client';

// app/factory/page.js
//
// Public, read-only "live activity" view of ArrowFactory: shows every pool
// it has created, auto-refreshing, styled entirely with Tailwind utility
// classes against the indigo/laser/violetglow theme. Nobody can create
// pools from this page (createPool is owner-only, by design) — this is
// purely a window into what the factory has done and is doing.

import { useState, useEffect, useCallback, useRef } from 'react';
import AppShell from '../../components/AppShell';
import {
  getFactoryPools,
  getFactoryPoolCount,
  ARROW_FACTORY_ADDRESS,
  ARROW_POOL_IMPLEMENTATION_ADDRESS,
  ARROW_ROUTER_ADDRESS,
} from '../../lib/arrowFactoryClient';
import { getTokenBySymbol, TOKENS } from '../../lib/swapConfig';

const AUTO_REFRESH_MS = 15000;
const EXPLORER_ADDR = (addr) => `https://testnet.arcscan.app/address/${addr}`;

function shortAddr(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function symbolFor(address) {
  const known = TOKENS.find((t) => t.address?.toLowerCase() === address?.toLowerCase());
  return known?.symbol || shortAddr(address);
}

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function FactoryPage() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [newestHighlight, setNewestHighlight] = useState(null);
  const prevCountRef = useRef(0);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async (opts = {}) => {
    const silent = !!opts.silent;
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (!silent) setLoading(true);
    setError(null);

    try {
      const fresh = await getFactoryPools();
      if (prevCountRef.current > 0 && fresh.length > prevCountRef.current) {
        setNewestHighlight(fresh[0]?.pool);
        setTimeout(() => setNewestHighlight(null), 4000);
      }
      prevCountRef.current = fresh.length;
      setPools(fresh);
      setLastRefreshed(Date.now());
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load factory activity.');
    } finally {
      if (!silent) setLoading(false);
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => refresh({ silent: true }), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <AppShell>
      <div className="max-w-[720px] mx-auto">
        <div className="mb-7 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-1 h-1 rounded-full bg-indigo-bright shadow-[0_0_8px_#8B7FFF]" />
              <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-dim">
                Infrastructure
              </div>
            </div>
            <h1 className="text-2xl sm:text-[30px] font-bold bg-gradient-to-r from-ivory via-ivory to-indigo-bright bg-clip-text text-transparent tracking-tight">
              ArrowFactory — Live
            </h1>
            <p className="text-dim text-sm mt-1.5">
              Every pool deployed and auto-registered with ArrowRouter, in real time.
            </p>
          </div>
          <button
            onClick={() => refresh()}
            disabled={loading}
            className="text-xs text-indigo-bright font-semibold disabled:opacity-40 flex-shrink-0 hover:text-laser transition-colors hover:drop-shadow-[0_0_6px_rgba(139,127,255,0.6)]"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Live stats strip */}
        <div className="relative flex items-center bg-gradient-to-br from-panel via-panel to-indigo/[0.04] border border-white/10 rounded-card px-5 py-4 gap-5 mb-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_40px_-24px_rgba(108,99,255,0.35)]">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[11px] text-dim uppercase tracking-[0.05em]">
              <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_0_3px_rgba(95,224,168,0.18),0_0_10px_rgba(95,224,168,0.5)] animate-pulse" />
              Pools created
            </div>
            <div className="font-mono text-[22px] font-bold text-ivory">
              {loading && pools.length === 0 ? '—' : pools.length}
            </div>
          </div>

          <div className="w-px self-stretch bg-gradient-to-b from-transparent via-white/15 to-transparent" />

          <div className="flex flex-col gap-1">
            <div className="text-[11px] text-dim uppercase tracking-[0.05em]">Auto-registered with</div>
            <a
              href={EXPLORER_ADDR(ARROW_ROUTER_ADDRESS)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[13px] font-semibold text-indigo-bright no-underline hover:text-laser transition-colors hover:drop-shadow-[0_0_6px_rgba(139,127,255,0.6)]"
            >
              ArrowRouter ↗
            </a>
          </div>

          <div className="w-px self-stretch bg-gradient-to-b from-transparent via-white/15 to-transparent" />

          <div className="flex flex-col gap-1">
            <div className="text-[11px] text-dim uppercase tracking-[0.05em]">Deployed via</div>
            <a
              href={EXPLORER_ADDR(ARROW_FACTORY_ADDRESS)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[13px] font-semibold text-indigo-bright no-underline hover:text-laser transition-colors hover:drop-shadow-[0_0_6px_rgba(139,127,255,0.6)]"
            >
              {shortAddr(ARROW_FACTORY_ADDRESS)} ↗
            </a>
          </div>
        </div>

        {error && <div className="mb-4 text-sm text-danger">{error}</div>}

        {/* Activity feed */}
        <div className="bg-gradient-to-b from-panel to-[#0A0A10] border border-white/10 rounded-card overflow-hidden shadow-[0_24px_48px_-28px_rgba(0,0,0,0.6)]">
          <div className="flex justify-between px-[18px] py-[14px] border-b border-white/10 text-xs text-dim uppercase tracking-[0.05em] bg-white/[0.015]">
            <span>Recent pool creations</span>
            <span>{lastRefreshed ? `updated ${timeAgo(lastRefreshed)}` : ''}</span>
          </div>

          {loading && pools.length === 0 && (
            <div className="py-8 px-[18px] text-center text-[13px] text-dim">Scanning ArrowFactory…</div>
          )}

          {!loading && pools.length === 0 && (
            <div className="py-8 px-[18px] text-center text-[13px] text-dim">No pools created yet.</div>
          )}

          {pools.map((p) => (
            <div
              key={p.pool}
              className={`flex justify-between items-center px-[18px] py-[14px] border-b border-white/5 last:border-b-0 transition-colors duration-[1200ms] hover:bg-white/[0.02] ${
                newestHighlight === p.pool ? 'bg-gradient-to-r from-indigo/10 via-indigo/5 to-transparent' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="font-mono text-[13px] font-bold text-ivory bg-black/40 border border-white/10 px-2.5 py-1 rounded-full">
                  {symbolFor(p.tokenA)}
                </div>
                <span className="text-dim text-xs">/</span>
                <div className="font-mono text-[13px] font-bold text-ivory bg-black/40 border border-white/10 px-2.5 py-1 rounded-full">
                  {symbolFor(p.tokenB)}
                </div>
                {newestHighlight === p.pool && (
                  <span className="font-mono text-[10px] font-bold text-success bg-success/10 border border-success/30 px-[7px] py-[2px] rounded-full ml-1 shadow-[0_0_10px_rgba(95,224,168,0.35)]">
                    NEW
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3.5">
                <a
                  href={EXPLORER_ADDR(p.pool)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-indigo-bright no-underline hover:text-laser transition-colors hover:drop-shadow-[0_0_6px_rgba(139,127,255,0.6)]"
                >
                  {shortAddr(p.pool)} ↗
                </a>
                <span className="text-[11px] text-dim min-w-[56px] text-right">{timeAgo(p.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11.5px] text-dim leading-relaxed text-center">
          Pool creation is restricted to the Arrow DEX team. This page shows what ArrowFactory
          has deployed — it doesn't let you create a pool yourself.
        </p>
      </div>
    </AppShell>
  );
}