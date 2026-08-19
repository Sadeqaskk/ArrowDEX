'use client';

// app/factory/page.js
//
// Public, read-only "live activity" view of ArrowFactory: shows every pool
// it has created, auto-refreshing, styled entirely with Tailwind utility
// classes against the indigo/laser/violetglow theme. Below the feed, an
// owner-gated admin panel appears ONLY when the connected wallet matches
// ArrowFactory.owner() — everyone else just sees the plain activity feed.

import { useState, useEffect, useCallback, useRef } from 'react';
import AppShell from '../../components/AppShell';
import { useWallet } from '../../lib/WalletContext';
import {
  getFactoryPools,
  getFactoryPoolCount,
  getFactoryOwner,
  createFactoryPool,
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
  const { address, isConnected, connect } = useWallet();

  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [newestHighlight, setNewestHighlight] = useState(null);
  const prevCountRef = useRef(0);
  const refreshingRef = useRef(false);

  // ── Owner admin state ──────────────────────────────────────────────
  const [isOwner, setIsOwner] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenAInput, setTokenAInput] = useState('');
  const [tokenBInput, setTokenBInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [symbolInput, setSymbolInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState('');
  const [createError, setCreateError] = useState(null);

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

  // Check ownership whenever the connected wallet changes — this is what
  // gates the entire admin panel below.
  useEffect(() => {
    if (!isConnected || !address) { setIsOwner(false); return; }
    getFactoryOwner()
      .then((owner) => setIsOwner(owner.toLowerCase() === address.toLowerCase()))
      .catch(() => setIsOwner(false));
  }, [isConnected, address]);

  async function handleCreatePool() {
    setCreating(true);
    setCreateError(null);
    try {
      await createFactoryPool({
        account: address,
        tokenA: tokenAInput,
        tokenB: tokenBInput,
        name: nameInput,
        symbol: symbolInput,
        onStatus: setCreateStatus,
      });
      setTokenAInput('');
      setTokenBInput('');
      setNameInput('');
      setSymbolInput('');
      setCreateOpen(false);
      refresh();
    } catch (err) {
      console.error(err);
      setCreateError(err.shortMessage || err.message || 'Failed to create pool.');
    } finally {
      setCreating(false);
      setCreateStatus('');
    }
  }

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
          has deployed.
        </p>

        {/* Owner-only admin panel — invisible to everyone except the
            connected wallet that matches ArrowFactory.owner(). */}
        {!isConnected && (
          <button
            onClick={connect}
            className="w-full mt-6 bg-white/[0.02] border border-white/10 text-dim text-xs font-semibold py-3 rounded-card hover:border-indigo-bright/30 hover:text-ivory transition-colors"
          >
            Connect wallet to check for owner tools
          </button>
        )}

        {isOwner && (
          <div className="mt-6">
            <button
              onClick={() => setCreateOpen((v) => !v)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-br from-indigo/15 to-indigo/[0.04] border border-indigo-bright/30 rounded-card px-4 py-3 text-indigo-bright text-[13px] font-semibold hover:border-indigo-bright/50 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-bright shadow-[0_0_8px_#8B7FFF]" />
              Owner tools — Create Pool
              <svg
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`w-3.5 h-3.5 transition-transform ${createOpen ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {createOpen && (
              <div className="flex flex-col gap-3 bg-panel border border-white/10 border-t-0 rounded-b-card px-5 py-5">
                <input
                  className="bg-black/30 border border-white/10 rounded-[10px] px-3 py-2.5 text-ivory font-mono text-[13px] outline-none placeholder:text-dim/50 focus:border-indigo-bright/40"
                  placeholder="Token A address (0x...)"
                  value={tokenAInput}
                  onChange={(e) => setTokenAInput(e.target.value)}
                />
                <input
                  className="bg-black/30 border border-white/10 rounded-[10px] px-3 py-2.5 text-ivory font-mono text-[13px] outline-none placeholder:text-dim/50 focus:border-indigo-bright/40"
                  placeholder="Token B address (0x...)"
                  value={tokenBInput}
                  onChange={(e) => setTokenBInput(e.target.value)}
                />
                <input
                  className="bg-black/30 border border-white/10 rounded-[10px] px-3 py-2.5 text-ivory font-mono text-[13px] outline-none placeholder:text-dim/50 focus:border-indigo-bright/40"
                  placeholder="LP token name (e.g. Arrow LP FOO-BAR)"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                />
                <input
                  className="bg-black/30 border border-white/10 rounded-[10px] px-3 py-2.5 text-ivory font-mono text-[13px] outline-none placeholder:text-dim/50 focus:border-indigo-bright/40"
                  placeholder="LP token symbol (e.g. ALP-FOO-BAR)"
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value)}
                />

                {createError && (
                  <div className="text-[12px] text-danger bg-danger/10 border border-danger/25 rounded-[10px] px-3 py-2.5">
                    {createError}
                  </div>
                )}

                <button
                  onClick={handleCreatePool}
                  disabled={creating || !tokenAInput || !tokenBInput || !nameInput || !symbolInput}
                  className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14px] py-3.5 rounded-[12px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {creating ? (createStatus || 'Creating…') : 'Create Pool'}
                </button>

                <p className="text-[11px] text-dim text-center">
                  This auto-registers with ArrowRouter in the same transaction.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}