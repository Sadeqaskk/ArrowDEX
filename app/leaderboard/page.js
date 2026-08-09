'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useWallet } from '@/lib/WalletContext';
import { useLeaderboardTop, useLeaderboardOverview, useWalletStats, CATEGORIES } from '@/lib/useLeaderboard';

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

// Top-3 get a quiet podium accent instead of the default hairline border —
// the one deliberate flourish on this page, everything else stays restrained.
const RANK_STYLES = {
  1: { text: 'text-[#FFD37A]', border: 'border-[#FFD37A]/25', glow: 'shadow-[0_0_24px_-10px_rgba(255,211,122,0.5)]' },
  2: { text: 'text-[#D8DEE9]', border: 'border-white/15', glow: 'shadow-[0_0_24px_-10px_rgba(216,222,233,0.35)]' },
  3: { text: 'text-[#E0A672]', border: 'border-[#E0A672]/25', glow: 'shadow-[0_0_24px_-10px_rgba(224,166,114,0.4)]' },
};

export default function LeaderboardPage() {
  const { address, isConnected, connect } = useWallet();
  const [category, setCategory] = useState('overall');
  const { rows, loading, error, refetch } = useLeaderboardTop(category, 50);
  const { overview } = useLeaderboardOverview();
  const { stats: myStats, loading: myLoading } = useWalletStats(isConnected ? address : null);

  const myRank = isConnected
    ? rows.findIndex((r) => r.wallet?.toLowerCase() === address?.toLowerCase()) + 1
    : 0;

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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:gap-[18px] items-start">
          {/* Ranked table */}
          <div className="glass p-5 sm:p-7">
            <div className="flex items-center justify-between mb-5">
              <div className="card-label">Top Traders</div>
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
            ) : rows.length === 0 ? (
              <div className="text-sm text-dim py-10 text-center">
                No activity yet in this category — be the first to trade and claim the top spot.
              </div>
            ) : (
              <div className="space-y-1.5">
                {rows.map((r, i) => {
                  const rank = i + 1;
                  const isMe = isConnected && r.wallet?.toLowerCase() === address?.toLowerCase();
                  const rs = RANK_STYLES[rank];
                  return (
                    <div
                      key={r.wallet}
                      className={`flex items-center gap-4 p-3.5 rounded-[14px] border transition-colors ${
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
                        <div className="font-mono text-sm font-semibold truncate">
                          {truncate(r.wallet)}
                          {isMe && (
                            <span className="ml-2 text-[10px] text-indigo-bright font-sans font-bold uppercase tracking-wider">
                              You
                            </span>
                          )}
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
                  <div className="text-3xl font-extrabold font-mono mt-1 hero-amount-gradient inline-block">
                    {myRank > 0 ? `#${myRank}` : 'Unranked'}
                  </div>
                  {myRank === 0 && (
                    <div className="text-[11px] text-dim mt-1">Not in the top 50 for this category yet</div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 font-mono">
                  <div>
                    <div className="text-[11px] text-dim uppercase tracking-wider">Swap Volume</div>
                    <div className="text-base font-bold mt-1">{fmtNum(myStats?.swap_volume)}</div>
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