'use client';

import { useState, useEffect } from 'react';
import AppShell from '../../components/AppShell';
import { useWallet } from '../../lib/WalletContext';
import { CHAINS, CHAIN_LIST } from '../../lib/chains';
import { ensureChain } from '../../lib/cctp';

const STORAGE_KEY = 'arrow-dex-preferences';

export default function SettingsPage() {
  const { address, isConnected, connect, disconnect, chainId, network, currentChain } = useWallet();

  const [notifications, setNotifications] = useState(true);
  const [defaultSlippage, setDefaultSlippage] = useState(0.5);
  const [switching, setSwitching] = useState(null);
  const [switchError, setSwitchError] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (typeof saved.notifications === 'boolean') setNotifications(saved.notifications);
      if (typeof saved.defaultSlippage === 'number') setDefaultSlippage(saved.defaultSlippage);
    } catch {
      // ignore malformed/missing storage
    }
  }, []);

  function savePrefs(next) {
    const merged = { notifications, defaultSlippage, ...next };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  }

  function toggleNotifications() {
    const next = !notifications;
    setNotifications(next);
    savePrefs({ notifications: next });
  }

  function updateSlippage(value) {
    setDefaultSlippage(value);
    savePrefs({ defaultSlippage: value });
  }

  async function handleSwitchNetwork(chain) {
    setSwitchError(null);
    setSwitching(chain.key);
    try {
      await ensureChain(chain);
    } catch (err) {
      setSwitchError(err.message || `Failed to switch to ${chain.name}.`);
    } finally {
      setSwitching(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-[680px] mx-auto">
        <div className="mb-6 sm:mb-8">
          <div className="card-label mb-2">Account</div>
          <h1 className="text-2xl sm:text-[28px] font-bold">Settings</h1>
          <p className="text-dim text-sm mt-1.5">Manage your wallet connection, network, and preferences.</p>
        </div>

        <div className="glass p-5 sm:p-7 mb-5">
          <div className="card-label mb-4">Wallet</div>
          {isConnected ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-3 border-b border-white/5">
                <span className="text-sm text-dim">Address</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs sm:text-sm break-all">{address}</span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(address)}
                    className="text-indigo-bright text-xs font-semibold flex-shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-white/5">
                <span className="text-sm text-dim">Active network</span>
                <span className="font-mono text-sm">{network}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-dim">Status</span>
                <span className="flex items-center gap-2 text-success text-sm font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_currentColor]" />
                  Connected
                </span>
              </div>
              <button
                onClick={disconnect}
                className="w-full mt-5 border border-danger/30 text-danger font-semibold text-sm py-3 rounded-[12px] hover:bg-danger/5 transition-colors"
              >
                Disconnect Wallet
              </button>
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-dim text-sm mb-4">No wallet connected.</p>
              <button
                onClick={connect}
                className="bg-gradient-to-br from-indigo-bright to-indigo text-white font-semibold text-sm px-6 py-3 rounded-[12px] shadow-glow"
              >
                Connect Wallet
              </button>
            </div>
          )}
        </div>

        <div className="glass p-5 sm:p-7 mb-5">
          <div className="card-label mb-1">Networks</div>
          <p className="text-xs text-dim mb-4">Switch your wallet&apos;s active network directly from here.</p>
          <div className="space-y-2.5">
            {CHAIN_LIST.map((chain) => {
              const isActive = chainId === chain.chainId;
              return (
                <div key={chain.key} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-[14px] gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                      {chain.name}
                      {isActive && <span className="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full font-semibold">ACTIVE</span>}
                    </div>
                    <div className="text-[11px] text-dim mt-1 font-mono">Chain ID {chain.chainId}</div>
                  </div>
                  <button
                    onClick={() => handleSwitchNetwork(chain)}
                    disabled={isActive || switching === chain.key || !isConnected}
                    className="text-xs font-semibold text-indigo-bright disabled:text-dim disabled:opacity-50 border border-indigo-bright/30 disabled:border-white/10 px-4 py-2 rounded-full transition-colors flex-shrink-0"
                  >
                    {switching === chain.key ? 'Switching…' : isActive ? 'Current' : 'Switch'}
                  </button>
                </div>
              );
            })}
          </div>
          {switchError && <div className="mt-3 text-sm text-danger">{switchError}</div>}
        </div>

        <div className="glass p-5 sm:p-7">
          <div className="card-label mb-4">Preferences</div>

          <div className="flex items-center justify-between gap-3 py-3 border-b border-white/5">
            <div className="min-w-0">
              <div className="text-sm font-medium">Transaction notifications</div>
              <div className="text-xs text-dim mt-0.5">Browser alerts for swap, bridge, and stake events</div>
            </div>
            <button
              onClick={toggleNotifications}
              className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${notifications ? 'bg-indigo' : 'bg-white/10'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${notifications ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
            <div>
              <div className="text-sm font-medium">Default slippage tolerance</div>
              <div className="text-xs text-dim mt-0.5">Applied by default on Bridge and Swap</div>
            </div>
            <div className="flex gap-1.5">
              {[0.1, 0.5, 1.0].map((s) => (
                <button
                  key={s}
                  onClick={() => updateSlippage(s)}
                  className={`px-3 py-1.5 rounded-lg font-mono text-xs ${defaultSlippage === s ? 'bg-indigo/20 text-indigo-bright' : 'bg-white/[0.03] text-dim'}`}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-dim mt-4">Preferences are saved to this browser (localStorage) — they won&apos;t follow you to another device.</p>
        </div>
      </div>
    </AppShell>
  );
}