'use client';

import AppShell from '../components/AppShell';
import { useWallet } from '../lib/WalletContext';
import { useRealBalances } from '../lib/useBalances';
import { CHAINS } from '../lib/chains';

const CHAIN_COLORS = {
  arcTestnet: 'from-[#8B7FFF] to-[#4d3fc9]',
  ethereumSepolia: 'from-[#4D8AFF] to-[#2f5fc9]',
  baseSepolia: 'from-[#5FE0A8] to-[#2f9e7c]',
};

const CHAIN_HEX = {
  arcTestnet: '#8B7FFF',
  ethereumSepolia: '#4D8AFF',
  baseSepolia: '#5FE0A8',
};

const CHAIN_LOGOS = {
  arcTestnet: '/fonts/chains/arc.png',
  ethereumSepolia: '/fonts/chains/ethereum.png',
  baseSepolia: '/fonts/chains/base.png',
};

export default function DashboardPage() {
  const { address, isConnected, connect, network } = useWallet();
  const { balances, totalUsdc, loading, error, lastUpdated, refetch } = useRealBalances(address);

  const chainEntries = Object.values(CHAINS).map((chain) => {
    const row = balances[chain.key];
    const usdcVal = row ? parseFloat(row.usdc) : 0;
    const pct = totalUsdc > 0 ? (usdcVal / totalUsdc) * 100 : 0;
    return { chain, row, usdcVal, pct };
  });

  let cumulative = 0;
  const ringStops = chainEntries
    .filter((e) => e.usdcVal > 0)
    .map((e) => {
      const start = cumulative;
      cumulative += e.pct;
      return `${CHAIN_HEX[e.chain.key]} ${start}% ${cumulative}%`;
    });
  const ringBackground = ringStops.length > 0
    ? `conic-gradient(${ringStops.join(', ')})`
    : 'conic-gradient(rgba(255,255,255,0.06) 0% 100%)';

  return (
    <AppShell>
      <div className="grid grid-cols-1 lg:grid-cols-[1.9fr_1fr_1fr] gap-4 lg:gap-[18px]">

        <div className="glass hero-ring lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3 p-6 sm:p-10 flex flex-col justify-between min-h-[280px] sm:min-h-[340px] relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(rgba(139,127,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139,127,255,0.5) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />
          <div className="relative">
            <div className="flex justify-between items-start gap-3">
              <span className="card-label">Total Portfolio · Live</span>
              <span className="text-[11px] sm:text-[11.5px] text-dim font-mono text-right flex-shrink-0">
                {lastUpdated ? `● UPDATED ${lastUpdated.toLocaleTimeString()}` : '○ NOT LOADED'}
              </span>
            </div>
            <div className="mt-4 sm:mt-[22px]">
              <div className="text-[13px] text-dim mb-3 font-medium">
                {isConnected ? 'Real balance across every connected chain' : 'Connect your wallet to see real balances'}
              </div>

              {!isConnected ? (
                <div className="text-[28px] sm:text-[32px] font-extrabold text-dim">— — —</div>
              ) : loading ? (
                <div className="text-[28px] sm:text-[32px] font-extrabold text-dim animate-pulse">Loading…</div>
              ) : (
                <div className="text-[42px] sm:text-[60px] font-extrabold leading-[0.95] tracking-tight hero-amount-gradient break-all sm:break-normal">
                  {totalUsdc.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  <span className="text-[16px] sm:text-[19px] text-dim font-semibold ml-2 sm:ml-2.5" style={{ WebkitTextFillColor: '#7B7A8C' }}>USDC</span>
                </div>
              )}

              {error && <div className="mt-3 text-sm text-danger">{error}</div>}
            </div>
          </div>
          <div className="relative flex flex-col sm:flex-row flex-wrap gap-2.5 mt-6">
            {!isConnected ? (
              <button onClick={connect} className="bg-gradient-to-br from-indigo-bright to-indigo text-white border-none px-[22px] py-[13px] rounded-[13px] text-[13.5px] font-semibold shadow-glow hover:-translate-y-px transition-transform">
                Connect Wallet
              </button>
            ) : (
              <>
                <a href="/bridge" className="text-center bg-gradient-to-br from-indigo-bright to-indigo text-white px-[22px] py-[13px] rounded-[13px] text-[13.5px] font-semibold shadow-glow hover:-translate-y-px transition-transform">Bridge Funds</a>
                <button
                  onClick={refetch}
                  disabled={loading}
                  className="border border-white/5 bg-white/[0.02] text-ivory px-[22px] py-[13px] rounded-[13px] text-[13.5px] font-semibold hover:-translate-y-px hover:border-indigo-bright/40 transition-all disabled:opacity-40"
                >
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
                <button
                  onClick={() => navigator.clipboard?.writeText(address)}
                  className="border border-white/5 bg-white/[0.02] text-ivory px-[22px] py-[13px] rounded-[13px] text-[13.5px] font-semibold hover:-translate-y-px hover:border-indigo-bright/40 transition-all"
                >
                  Copy Address
                </button>
              </>
            )}
          </div>
        </div>

        <div className="glass p-6 min-h-[140px] sm:min-h-[158px] flex flex-col justify-between">
          <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${isConnected ? 'bg-success/10 text-success' : 'bg-white/5 text-dim'}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
          </div>
          <div>
            <div className="card-label">Wallet Status</div>
            <div className={`text-2xl sm:text-[27px] font-bold mt-2 font-mono ${isConnected ? 'text-success' : 'text-dim'}`}>
              {isConnected ? 'Connected' : 'Offline'}
            </div>
            <div className="text-xs text-dim mt-1.5 font-mono truncate">
              {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'No wallet linked'}
            </div>
          </div>
        </div>

        <div className="glass p-6 min-h-[140px] sm:min-h-[158px] flex flex-col justify-between">
          <div className="w-9 h-9 rounded-[10px] bg-indigo/10 text-indigo-bright flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" /></svg>
          </div>
          <div>
            <div className="card-label">Wallet&apos;s Active Network</div>
            <div className="text-lg sm:text-[19px] font-bold mt-2 font-mono truncate">{network}</div>
            <div className="text-xs text-dim mt-1.5">Balances below track all 3 chains regardless</div>
          </div>
        </div>

        <div className="glass p-6 min-h-[140px] sm:min-h-[158px] flex flex-col justify-between">
          <div className="w-9 h-9 rounded-[10px] bg-indigo/10 text-indigo-bright flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M8 3v3M16 3v3" /></svg>
          </div>
          <div>
            <div className="card-label">Chains Tracked</div>
            <div className="text-2xl sm:text-[27px] font-bold mt-2 font-mono">3</div>
            <div className="text-xs text-dim mt-1.5">Arc · Ethereum Sepolia · Base Sepolia</div>
          </div>
        </div>

        <div className="glass lg:col-start-1 lg:col-end-2 p-5 sm:p-7 min-h-[260px] flex flex-col">
          <div className="card-label mb-5">Allocation</div>
          {!isConnected ? (
            <div className="flex-1 flex items-center justify-center text-dim text-sm text-center">Connect to see your real split.</div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="relative w-[150px] h-[150px]">
                <div
                  className="w-full h-full rounded-full transition-all duration-700"
                  style={{ background: ringBackground }}
                />
                <div className="absolute inset-[14px] rounded-full bg-[#0A0A10] flex flex-col items-center justify-center">
                  <div className="font-mono text-lg font-bold">{loading ? '…' : `${chainEntries.filter((e) => e.usdcVal > 0).length}`}</div>
                  <div className="text-[10px] text-dim uppercase tracking-wider mt-0.5">active</div>
                </div>
              </div>
              <div className="mt-6 w-full space-y-2.5">
                {chainEntries.map((e) => (
                  <div key={e.chain.key} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-dim">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHAIN_HEX[e.chain.key] }} />
                      {e.chain.name}
                    </span>
                    <span className="font-mono text-ivory">{loading ? '…' : `${e.pct.toFixed(1)}%`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="glass lg:col-start-2 lg:col-end-3 p-6 flex flex-col justify-between">
          <div>
            <div className="card-label mb-3">Swap</div>
            <p className="text-sm text-dim leading-relaxed">
              Live on Arc Testnet — swap USDC ⇄ EURC through the ArrowSwap contract. cirBTC support coming soon.
            </p>
          </div>
          <a href="/swap" className="mt-6 text-center block bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14.5px] py-[15px] rounded-[13px] shadow-glow">
            Open Swap
          </a>
        </div>

        <div className="glass lg:col-start-3 lg:col-end-4 lg:row-start-3 lg:row-end-5 p-6 flex flex-col justify-between">
          <div>
            <div className="card-label mb-3">Vaults</div>
            <p className="text-sm text-dim leading-relaxed">
              Live on Arc Testnet — stake ARROW-LP tokens to earn ARROW rewards over time. No lock period.
            </p>
          </div>
          <a href="/vaults" className="mt-6 text-center block bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14.5px] py-[15px] rounded-[13px] shadow-glow">
            Open Vault
          </a>
        </div>

        <div className="glass lg:col-start-1 lg:col-end-3 p-5 sm:p-7">
          <div className="card-label mb-5">Holdings by Chain · Live</div>
          {!isConnected ? (
            <div className="text-dim text-sm py-6 text-center">Connect your wallet to see real holdings.</div>
          ) : (
            <div className="space-y-2">
              {chainEntries.map(({ chain, row, usdcVal, pct }) => (
                <div
                  key={chain.key}
                  className="flex items-center gap-4 p-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-[16px] transition-colors"
                >
                  <img
                    src={CHAIN_LOGOS[chain.key]}
                    alt={chain.name}
                    className="w-11 h-11 rounded-full flex-shrink-0 object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-sm truncate">{chain.name}</div>
                      <div className="font-mono text-sm font-bold flex-shrink-0">
                        {loading ? '…' : `${usdcVal.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC`}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <div className="text-[11px] text-dim">
                        {row?.native ? `${parseFloat(row.native).toFixed(4)} ${row.nativeSymbol} gas` : 'native gas'}
                      </div>
                   <a   
                        href={`${chain.explorer}/address/${address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-indigo-bright font-mono flex-shrink-0"
                      >
                        view →
                      </a>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.max(2, pct)}%`, backgroundColor: CHAIN_HEX[chain.key] }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}