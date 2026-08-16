'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AppShell from '../../components/AppShell';
import { useWallet } from '../../lib/WalletContext';
import { fetchActivity } from '../../lib/activity';
import { CHAINS } from '../../lib/chains';

const FILTERS = ['All', 'Pool', 'Vault', 'WUSDC'];

function LivePulse({ ok }) {
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? 'bg-success animate-pulse' : 'bg-dim/40'}`} />;
}

function timeAgo(ts) {
  if (!ts) return null;
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function groupByDay(events) {
  const groups = [];
  let currentKey = null;
  let currentGroup = null;
  for (const e of events) {
    const key = e.timestamp ? new Date(e.timestamp).toDateString() : '__unknown__';
    if (key !== currentKey) {
      currentKey = key;
      currentGroup = { key, label: e.timestamp ? dayLabel(e.timestamp) : 'Earlier', items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(e);
  }
  return groups;
}

export default function ActivityPage() {
  const { address, isConnected, connect } = useWallet();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [copiedId, setCopiedId] = useState(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const activity = await fetchActivity(address);
      setEvents(activity);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load activity — see console for details.');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  const counts = useMemo(() => {
    const c = { All: events.length, Pool: 0, Vault: 0, WUSDC: 0 };
    for (const e of events) {
      if (c[e.source] != null) c[e.source] += 1;
    }
    return c;
  }, [events]);

  const filtered = filter === 'All' ? events : events.filter((e) => e.source === filter);
  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  const lastActivity = events[0]?.timestamp ? timeAgo(events[0].timestamp) : null;
  const positiveCount = events.filter((e) => e.tone === 'positive').length;

  function copyHash(id, hash) {
    navigator.clipboard?.writeText(hash).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    }).catch(() => {});
  }

  return (
    <AppShell>
      <div className="max-w-[680px] mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="card-label mb-2 flex items-center gap-1.5"><LivePulse ok={isConnected && !error} /> On-Chain</div>
            <h1 className="text-[28px] font-bold">Activity</h1>
            <p className="text-dim text-sm mt-1.5">
              Real transaction history, scanned directly from Arc Testnet — no explorer API, no mock data.
            </p>
          </div>
          {isConnected && (
            <button onClick={refresh} disabled={loading} className="text-xs text-indigo-bright font-semibold disabled:opacity-40 flex-shrink-0 ml-4">
              {loading ? 'Scanning…' : 'Refresh'}
            </button>
          )}
        </div>

        {!isConnected ? (
          <div className="glass p-10 text-center relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-[0.04] pointer-events-none"
              style={{
                backgroundImage: 'linear-gradient(rgba(139,127,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139,127,255,0.5) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            />
            <p className="relative text-dim text-sm mb-4">Connect your wallet to see your real activity.</p>
            <button onClick={connect} className="relative bg-gradient-to-br from-indigo-bright to-indigo text-white font-semibold text-sm px-6 py-3 rounded-[12px] shadow-glow hover:-translate-y-px transition-transform">
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            {events.length > 0 && (
              <div className="glass p-4 sm:p-5 mb-5 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex gap-6">
                  <div>
                    <div className="text-[10.5px] text-dim uppercase tracking-wide">Total events</div>
                    <div className="font-mono text-lg font-bold mt-0.5">{events.length}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] text-dim uppercase tracking-wide">Rewards claimed</div>
                    <div className="font-mono text-lg font-bold mt-0.5 text-success">{positiveCount}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] text-dim uppercase tracking-wide">Last activity</div>
                    <div className="font-mono text-sm font-bold mt-0.5">{lastActivity || '—'}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 mb-5 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${filter === f ? 'bg-indigo/15 text-indigo-bright' : 'bg-white/[0.03] text-dim hover:text-ivory'}`}
                >
                  {f}
                  {counts[f] > 0 && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${filter === f ? 'bg-indigo-bright/20' : 'bg-white/5'}`}>
                      {counts[f]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="glass p-2">
              {loading && events.length === 0 ? (
                <div className="divide-y divide-white/5">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-4">
                      <div className="w-9 h-9 rounded-[10px] bg-white/5 animate-pulse flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
                        <div className="h-2.5 w-48 bg-white/5 rounded animate-pulse" />
                      </div>
                      <div className="h-3 w-16 bg-white/5 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="text-danger text-sm text-center py-16 px-6">{error}</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <div className="w-11 h-11 rounded-full bg-white/5 text-dim flex items-center justify-center mx-auto mb-3">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></svg>
                  </div>
                  <div className="text-dim text-sm">No {filter !== 'All' ? filter.toLowerCase() : ''} activity found for this wallet yet.</div>
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.key}>
                    <div className="px-5 pt-4 pb-2 text-[10.5px] font-bold uppercase tracking-wider text-dim/70">
                      {group.label}
                    </div>
                    <div className="divide-y divide-white/5">
                      {group.items.map((e) => (
                        <div
                          key={e.id}
                          className="group flex items-center justify-between gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors"
                        >
                          <a
                            href={`${CHAINS.arcTestnet.explorer}/tx/${e.transactionHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-3 flex-1 min-w-0"
                          >
                            <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
                              e.tone === 'positive' ? 'bg-success/10 text-success' : 'bg-indigo/10 text-indigo-bright'
                            }`}>
                              <EventIcon eventName={e.eventName} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold truncate">{e.label}</div>
                              <div className="text-xs text-dim mt-0.5 font-mono truncate">{e.detail}</div>
                            </div>
                          </a>
                          <div className="text-right flex-shrink-0 flex items-center gap-2.5">
                            <div>
                              <div className="text-xs text-dim" title={e.timestamp ? new Date(e.timestamp).toLocaleString() : undefined}>
                                {e.timestamp ? timeAgo(e.timestamp) : `Block ${e.blockNumber}`}
                              </div>
                              <button
                                onClick={(ev) => { ev.preventDefault(); copyHash(e.id, e.transactionHash); }}
                                className="text-[11px] text-indigo-bright font-mono mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity"
                              >
                                {copiedId === e.id ? 'Copied ✓' : `${e.transactionHash.slice(0, 8)}…`}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <p className="text-[11px] text-dim mt-5 leading-relaxed">
              Scanned live from {CHAINS.arcTestnet.name} via public RPC — covers Pool, Vault, and WUSDC contract
              events tied to your address. Very old activity could be missed if the chain grows beyond what a
              single log query can cover in one call.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function EventIcon({ eventName }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, className: 'w-4 h-4' };
  switch (eventName) {
    case 'LiquidityAdded':
    case 'Staked':
    case 'Deposit':
      return <svg {...common}><path d="M12 5v14M5 12l7-7 7 7" /></svg>;
    case 'LiquidityRemoved':
    case 'Withdrawn':
    case 'Withdrawal':
      return <svg {...common}><path d="M12 19V5M5 12l7 7 7-7" /></svg>;
    case 'Swap':
      return <svg {...common}><path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" /></svg>;
    case 'RewardPaid':
      return <svg {...common}><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>;
  }
}