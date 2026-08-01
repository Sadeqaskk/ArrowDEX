'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from '../../components/AppShell';
import { useWallet } from '../../lib/WalletContext';
import { fetchActivity } from '../../lib/activity';
import { CHAINS } from '../../lib/chains';

const FILTERS = ['All', 'Pool', 'Vault', 'WUSDC'];

export default function ActivityPage() {
  const { address, isConnected, connect } = useWallet();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');

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

  const filtered = filter === 'All' ? events : events.filter((e) => e.source === filter);

  return (
    <AppShell>
      <div className="max-w-[680px] mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="card-label mb-2">On-Chain</div>
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
          <div className="glass p-10 text-center">
            <p className="text-dim text-sm mb-4">Connect your wallet to see your real activity.</p>
            <button onClick={connect} className="bg-gradient-to-br from-indigo-bright to-indigo text-white font-semibold text-sm px-6 py-3 rounded-[12px] shadow-glow">
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${filter === f ? 'bg-indigo/15 text-indigo-bright' : 'bg-white/[0.03] text-dim'}`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="glass p-2">
              {loading && events.length === 0 ? (
                <div className="text-dim text-sm text-center py-16">Scanning on-chain logs…</div>
              ) : error ? (
                <div className="text-danger text-sm text-center py-16 px-6">{error}</div>
              ) : filtered.length === 0 ? (
                <div className="text-dim text-sm text-center py-16">No activity found for this wallet yet.</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filtered.map((e) => (
                    <a       
                      key={e.id}
                      href={`${CHAINS.arcTestnet.explorer}/tx/${e.transactionHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
                          e.tone === 'positive' ? 'bg-success/10 text-success' : 'bg-indigo/10 text-indigo-bright'
                        }`}>
                          <EventIcon eventName={e.eventName} />
                        </div>
                        <div>
                          <div className="text-sm font-bold">{e.label}</div>
                          <div className="text-xs text-dim mt-0.5 font-mono">{e.detail}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <div className="text-xs text-dim">
                          {e.timestamp ? new Date(e.timestamp).toLocaleString() : `Block ${e.blockNumber}`}
                        </div>
                        <div className="text-[11px] text-indigo-bright font-mono mt-0.5">
                          {e.transactionHash.slice(0, 8)}…
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
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