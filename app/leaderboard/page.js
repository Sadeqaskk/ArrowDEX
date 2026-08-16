'use client';

import { useState, useEffect, useMemo } from 'react';
import AppShell from '@/components/AppShell';
import { useWallet } from '@/lib/WalletContext';
import { useLeaderboardTop, useLeaderboardOverview, useWalletStats, CATEGORIES } from '@/lib/useLeaderboard';

const EXPLORER_ADDR = (addr) => `https://testnet.arcscan.app/address/${addr}`;
const SNAPSHOT_MIN_GAP_MS = 5 * 60 * 1000; // don't overwrite the "last visit" baseline more than once per 5min

function truncate(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtNum(n, opts = {}) {
  const v = typeof n === 'string' ? parseFloat(n) : n;
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString(undefined, { maximumFractionDigits: 2, ...opts });
}

function timeAgo(ts) {
  if (!ts) return '—';
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── "Since last visit" tracking (client-side, mirrors the Dashboard's
// portfolio snapshotting) — lets rank movement and volume change show up
// without a backend history table.
function lbSnapKey(category) { return `arrowdex:leaderboard:snap:${category}`; }
function meSnapKey(address) { return `arrowdex:leaderboard:me:${address}`; }

function loadJSON(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveJSONThrottled(key, value) {
  if (typeof window === 'undefined') return;
  const existing = loadJSON(key);
  if (existing?.t && Date.now() - existing.t < SNAPSHOT_MIN_GAP_MS) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ t: Date.now(), ...value }));
  } catch { /* storage unavailable — deltas just won't show this session */ }
}

// Small, muted arrow + number — intentionally not a colored pill, to stay
// in step with this page's existing restraint.
function RankDelta({ delta, isNew }) {
  if (isNew) return <span className="text-[10px] text-indigo-bright font-mono ml-1.5">new</span>;
  if (delta == null || delta === 0) return null;
  const up = delta > 0; // positive delta = moved up in rank
  return (
    <span className={`text-[10.5px] font-mono ml-1.5 inline-flex items-center gap-0.5 ${up ? 'text-success' : 'text-danger'}`}>
      <svg viewBox="0 0 10 10" className={`w-2 h-2 ${up ? '' : 'rotate-180'}`} fill="currentColor"><path d="M5 1l4 5H6v3H4V6H1z" /></svg>
      {Math.abs(delta)}
    </span>
  );
}

export default function LeaderboardPage() {
  const { address, isConnected, connect } = useWallet();
  const [category, setCategory] = useState('overall');
  const [search, setSearch] = useState('');
  const { rows, loading, error, refetch } = useLeaderboardTop(category, 50);
  const { overview } = useLeaderboardOverview();
  const { stats: myStats, loading: myLoading } = useWalletStats(isConnected ? address : null);

  const [prevSnap, setPrevSnap] = useState(null);
  const [prevMe, setPrevMe] = useState(null);
  const [copiedWallet, setCopiedWallet] = useState(null);

  // Read the previous snapshot for THIS category before we overwrite it,
  // so deltas compare against what was on screen last visit — not this load.
  useEffect(() => {
    setPrevSnap(loadJSON(lbSnapKey(category)));
  }, [category]);

  useEffect(() => {
    if (!isConnected || !address) return;
    setPrevMe(loadJSON(meSnapKey(address)));
  }, [isConnected, address]);

  useEffect(() => {
    if (!rows.length) return;
    const map = {};
    rows.forEach((r, i) => { map[r.wallet] = { rank: i + 1, volume: r.volume }; });
    saveJSONThrottled(lbSnapKey(category), { rows: map });
  }, [rows, category]);

  useEffect(() => {
    if (!isConnected || !address || !myStats) return;
    saveJSONThrottled(meSnapKey(address), {
      rank: rows.findIndex((r) => r.wallet?.toLowerCase() === address?.toLowerCase()) + 1,
      volume: myStats.swap_volume,
    });
  }, [isConnected, address, myStats, rows]);

  const myRank = isConnected
    ? rows.findIndex((r) => r.wallet?.toLowerCase() === address?.toLowerCase()) + 1
    : 0;

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => r.wallet?.toLowerCase().includes(q));
  }, [rows, search]);

  const myRankDelta = prevMe?.rank && myRank > 0 ? prevMe.rank - myRank : null; // fewer = better, so delta = old - new
  const myVolumeDelta = prevMe?.volume != null && myStats?.swap_volume != null
    ? parseFloat(myStats.swap_volume) - parseFloat(prevMe.volume)
    : null;

  function copyWallet(wallet) {
    navigator.clipboard?.writeText(wallet).then(() => {
      setCopiedWallet(wallet);
      setTimeout(() => setCopiedWallet(null), 1200);
    }).catch(() => {});
  }

  const RANK_STYLES = {
    1: { text: 'text-[#FFD37A]', border: 'border-[#FFD37A]/25', glow: 'shadow-[0_0_24px_-10px_rgba(255,211,122,0.5)]' },
    2: { text: 'text-[#D8DEE9]', border: 'border-white/15', glow: 'shadow-[0_0_24px_-10px_rgba(216,222,233,0.35)]' },
    3: { text: 'text-[#E0A672]', border: 'border-[#E0A672]/25', glow: 'shadow-[0_0_24px_-10px_rgba(224,166,114,0.4)]' },
  };

  return (
    <AppShell>
      <div className="space-y-4 lg:space-y-[18px]">
        {/* Hero */}
        <div className="glass hero-ring p-6 sm:p-10 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(139,127,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139,127,255,0.5) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />
          <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="card-label">Traders Leaderboard · Live</span>
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              </div>
              <div className="mt-4 sm:mt-[22px] text-[13px] text-dim font-medium">
                Total network trading volume, all chains combined
              </div>
              <div className="mt-3 text-[42px] sm:text-[60px] font-extrabold leading-[0.95] tracking-tight hero-amount-gradient break-all sm:break-normal">
                {overview ? fmtNum(overview.total_swap_volume) : '— — —'}
                <span
                  className="text-[16px] sm:text-[19px] text-dim font-semibold ml-2 sm:ml-2.5"
                  style={{ WebkitTextFillColor: '#7B7A8C' }}
                >
                  USDC
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-6 sm:gap-10 font-mono">
              <div>
                <div className="text-[11px] text-dim uppercase tracking-wider">Traders</div>
                <div className="text-xl sm:text-2xl font-bold mt-1">
                  {overview ? fmtNum(overview.total_traders, { maximumFractionDigits: 0 }) : '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-dim uppercase tracking-wider">Fees Paid</div>
                <div className="text-xl sm:text-2xl font-bold mt-1">
                  {overview ? fmtNum(overview.total_fees) : '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-dim uppercase tracking-wider">Trades</div>
                <div className="text-xl sm:text-2xl font-bold mt-1">
                  {overview ? fmtNum(overview.total_trades, { maximumFractionDigits: 0 }) : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`px-4 py-2 rounded-[11px] text-[13px] font-semibold transition-all border ${
                  category === c.key
                    ? 'bg-gradient-to-br from-indigo-bright to-indigo text-white border-transparent shadow-glow'
                    : 'border-white/5 bg-white/[0.02] text-dim hover:text-ivory hover:border-indigo-bright/30'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-56">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-dim absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a wallet…"
              className="w-full bg-white/[0.03] border border-white/5 focus:border-indigo-bright/30 rounded-[11px] pl-9 pr-3 py-2 text-[13px] outline-none placeholder:text-dim/50 transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:gap-[18px] items-start">
          {/* Ranked table */}
          <div className="glass p-5 sm:p-7">
            <div className="flex items-center justify-between mb-5">
              <div className="card-label">
                Top Traders {search && <span className="text-dim font-normal normal-case">· {filteredRows.length} match{filteredRows.length === 1 ? '' : 'es'}</span>}
              </div>
              <button
                onClick={refetch}
                disabled={loading}
                className="text-[11px] text-indigo-bright font-mono disabled:opacity-40"
              >
                {loading ? 'refreshing…' : 'refresh →'}
              </button>
            </div>

            {error ? (
              <div className="text-sm text-danger py-10 text-center">
                Couldn&apos;t load the leaderboard — {error}
              </div>
            ) : loading ? (
              <div className="text-sm text-dim py-10 text-center animate-pulse">Loading rankings…</div>
            ) : filteredRows.length === 0 ? (
              <div className="text-sm text-dim py-10 text-center">
                {search
                  ? `No wallet matching "${search}" in the top 50.`
                  : 'No activity yet in this category — be the first to trade and claim the top spot.'}
              </div>
            ) : (
              <div className="space-y-1.5">
                {rows.map((r, i) => {
                  if (search && !filteredRows.includes(r)) return null;
                  const rank = i + 1;
                  const isMe = isConnected && r.wallet?.toLowerCase() === address?.toLowerCase();
                  const rs = RANK_STYLES[rank];
                  const prev = prevSnap?.rows?.[r.wallet];
                  const rankDelta = prev ? prev.rank - rank : null;
                  const isNew = prevSnap && !prev;

                  return (
                    <div
                      key={r.wallet}
                      className={`group flex items-center gap-4 p-3.5 rounded-[14px] border transition-colors ${
                        isMe
                          ? 'border-indigo-bright/40 bg-indigo/[0.06]'
                          : rs
                          ? `${rs.border} bg-white/[0.02] ${rs.glow}`
                          : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className={`w-8 text-center font-mono font-bold text-sm ${rs ? rs.text : 'text-dim'}`}>
                        {rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm font-semibold truncate flex items-center">
                          {truncate(r.wallet)}
                          {isMe && (
                            <span className="ml-2 text-[10px] text-indigo-bright font-sans font-bold uppercase tracking-wider">
                              You
                            </span>
                          )}
                          <RankDelta delta={rankDelta} isNew={isNew} />
                        </div>
                        <div className="text-[11px] text-dim mt-0.5">
                          {timeAgo(r.last_active)} · {fmtNum(r.trade_count, { maximumFractionDigits: 0 })} trades
                        </div>
                      </div>
                      <div className="text-right font-mono flex-shrink-0">
                        <div className="text-sm font-bold">
                          {fmtNum(r.volume)} <span className="text-dim font-normal">USDC</span>
                        </div>
                        <div className="text-[11px] text-dim mt-0.5">{fmtNum(r.fees)} fees</div>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyWallet(r.wallet)}
                          title="Copy address"
                          className="w-7 h-7 rounded-md hover:bg-white/5 text-dim hover:text-ivory flex items-center justify-center"
                        >
                          {copiedWallet === r.wallet ? (
                            <span className="text-[9px] font-mono text-success">✓</span>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
                          )}
                        </button>
                        <a
                          href={EXPLORER_ADDR(r.wallet)}
                          target="_blank"
                          rel="noreferrer"
                          title="View on explorer"
                          className="w-7 h-7 rounded-md hover:bg-white/5 text-dim hover:text-indigo-bright flex items-center justify-center"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6M10 14L21 3" /></svg>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Your stats */}
          <div className="glass p-6 flex flex-col gap-5 lg:sticky lg:top-6">
            <div className="card-label">Your Stats</div>
            {!isConnected ? (
              <>
                <div className="text-sm text-dim leading-relaxed">
                  Connect your wallet to see your rank and trading stats.
                </div>
                <button
                  onClick={connect}
                  className="bg-gradient-to-br from-indigo-bright to-indigo text-white px-[22px] py-[13px] rounded-[13px] text-[13.5px] font-semibold shadow-glow hover:-translate-y-px transition-transform"
                >
                  Connect Wallet
                </button>
              </>
            ) : myLoading ? (
              <div className="text-sm text-dim animate-pulse">Loading your stats…</div>
            ) : (
              <>
                <div>
                  <div className="text-[11px] text-dim uppercase tracking-wider">Your Rank</div>
                  <div className="flex items-baseline">
                    <div className="text-3xl font-extrabold font-mono mt-1 hero-amount-gradient inline-block">
                      {myRank > 0 ? `#${myRank}` : 'Unranked'}
                    </div>
                    {myRank > 0 && <RankDelta delta={myRankDelta} isNew={prevMe == null} />}
                  </div>
                  {myRank === 0 && (
                    <div className="text-[11px] text-dim mt-1">Not in the top 50 for this category yet</div>
                  )}
                  {prevMe && <div className="text-[10.5px] text-dim mt-1">vs. your last visit</div>}
                </div>
                <div className="grid grid-cols-2 gap-4 font-mono">
                  <div>
                    <div className="text-[11px] text-dim uppercase tracking-wider">Swap Volume</div>
                    <div className="text-base font-bold mt-1">{fmtNum(myStats?.swap_volume)}</div>
                    {myVolumeDelta != null && Math.abs(myVolumeDelta) > 0.0001 && (
                      <div className={`text-[10.5px] mt-0.5 ${myVolumeDelta > 0 ? 'text-success' : 'text-danger'}`}>
                        {myVolumeDelta > 0 ? '+' : ''}{fmtNum(myVolumeDelta)} since last visit
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] text-dim uppercase tracking-wider">Fees Paid</div>
                    <div className="text-base font-bold mt-1">{fmtNum(myStats?.total_fees_paid)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-dim uppercase tracking-wider">Bridge Volume</div>
                    <div className="text-base font-bold mt-1">{fmtNum(myStats?.bridge_volume)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-dim uppercase tracking-wider">Net Staked</div>
                    <div className="text-base font-bold mt-1">{fmtNum(myStats?.staked_volume)}</div>
                  </div>
                </div>
                <div className="text-[11px] text-dim font-mono border-t border-white/5 pt-4">
                  {myStats?.last_active ? `Last active ${timeAgo(myStats.last_active)}` : 'No activity yet'}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}