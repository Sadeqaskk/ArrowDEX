'use client';

import { useState, useEffect } from 'react';
import AppShell from '../../components/AppShell';
import { useWallet } from '../../lib/WalletContext';
import { CHAINS, CHAIN_LIST } from '../../lib/chains';
import { ensureChain } from '../../lib/cctp';
import { getPreferences, savePreferences, useNotify } from '../../components/NotificationProvider';
import DesktopModeToggle from '../../components/DesktopModeToggle';

const PREVIEW_EVENTS = [
  { type: 'swap', title: 'Swapped 250 USDC → 231.4 EURC', message: 'Filled via ArrowSwap Engine · 0.06% price impact' },
  { type: 'addLiquidity', title: 'Added Liquidity', message: '120 WUSDC + 84.2 ARROW deposited' },
  { type: 'stake', title: 'Staked 84.2 ARROW-LP', message: 'Now earning 12.4% APR' },
  { type: 'claim', title: 'Claimed 6.18 ARROW', message: 'Rewards sent to your wallet' },
];

export default function SettingsPage() {
  const { address, isConnected, connect, disconnect, chainId, network, currentChain } = useWallet();
  const notify = useNotify();

  const [notifications, setNotifications] = useState(true);
  const [defaultSlippage, setDefaultSlippage] = useState(0.5);
  const [switching, setSwitching] = useState(null);
  const [switchError, setSwitchError] = useState(null);
  const [permission, setPermission] = useState('unsupported');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const prefs = getPreferences();
    setNotifications(prefs.notifications);
    setDefaultSlippage(prefs.defaultSlippage);
    setPermission(typeof window !== 'undefined' && typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  }, []);

  function toggleNotifications() {
    const next = !notifications;
    setNotifications(next);
    savePreferences({ notifications: next });
  }

  function updateSlippage(value) {
    setDefaultSlippage(value);
    savePreferences({ defaultSlippage: value });
  }

  async function requestSystemNotifications() {
    if (typeof Notification === 'undefined') return;
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        notify({ type: 'claim', title: 'System notifications on', message: "You'll get alerts here even when this tab isn't focused." });
      }
    } finally {
      setRequesting(false);
    }
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

  const permissionMeta = {
    granted: { label: 'Enabled', tone: 'text-success', dot: 'bg-success' },
    denied: { label: 'Blocked by browser', tone: 'text-danger', dot: 'bg-danger' },
    default: { label: 'Not enabled', tone: 'text-dim', dot: 'bg-dim/40' },
    unsupported: { label: 'Not supported in this browser', tone: 'text-dim', dot: 'bg-dim/40' },
  }[permission];

  return (
    <AppShell>
      <div className="max-w-[680px] mx-auto">
        <div className="mb-6 sm:mb-8">
          <div className="card-label mb-2">Account</div>
          <h1 className="text-2xl sm:text-[28px] font-bold">Settings</h1>
          <p className="text-dim text-sm mt-1.5">Manage your wallet connection, network, and preferences.</p>
        </div>

        <div className="glass p-5 sm:p-7 mb-5 hover:border-indigo-bright/20 border border-transparent transition-colors">
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
                  <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_currentColor] animate-pulse" />
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
                className="bg-gradient-to-br from-indigo-bright to-indigo text-white font-semibold text-sm px-6 py-3 rounded-[12px] shadow-glow hover:-translate-y-px transition-transform"
              >
                Connect Wallet
              </button>
            </div>
          )}
        </div>

        <div className="glass p-5 sm:p-7 mb-5 hover:border-indigo-bright/20 border border-transparent transition-colors">
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

        {/* Notifications — now a real, working system */}
        <div className="glass p-5 sm:p-7 mb-5 hover:border-indigo-bright/20 border border-transparent transition-colors">
          <div className="card-label mb-1">Notifications</div>
          <p className="text-xs text-dim mb-4">Get alerted the moment a swap, bridge, wrap, liquidity, or staking transaction confirms.</p>

          <div className="flex items-center justify-between gap-3 py-3 border-b border-white/5">
            <div className="min-w-0">
              <div className="text-sm font-medium">In-app alerts</div>
              <div className="text-xs text-dim mt-0.5">Premium banner notifications inside ArrowDEX</div>
            </div>
            <button
              onClick={toggleNotifications}
              className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${notifications ? 'bg-indigo' : 'bg-white/10'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${notifications ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 py-3 border-b border-white/5">
            <div className="min-w-0">
              <div className="text-sm font-medium">System notifications</div>
              <div className="text-xs text-dim mt-0.5 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${permissionMeta.dot}`} />
                <span className={permissionMeta.tone}>{permissionMeta.label}</span>
                <span className="text-dim">· fires even when this tab is in the background</span>
              </div>
            </div>
            {permission !== 'granted' && permission !== 'unsupported' && (
              <button
                onClick={requestSystemNotifications}
                disabled={requesting || permission === 'denied'}
                title={permission === 'denied' ? 'Blocked — re-enable from your browser\'s site settings' : undefined}
                className="text-xs font-semibold text-indigo-bright disabled:text-dim disabled:opacity-50 border border-indigo-bright/30 disabled:border-white/10 px-4 py-2 rounded-full transition-colors flex-shrink-0"
              >
                {requesting ? 'Requesting…' : 'Enable'}
              </button>
            )}
          </div>

          <div className="py-4">
            <div className="text-sm font-medium mb-1">Preview the style</div>
            <div className="text-xs text-dim mb-3">See exactly how a confirmed transaction will notify you.</div>
            <div className="flex flex-wrap gap-2">
              {PREVIEW_EVENTS.map((e) => (
                <button
                  key={e.type}
                  onClick={() => notify({ ...e, txHash: '0x' + '1a2b3c4d5e6f'.repeat(5) })}
                  className="text-xs font-semibold text-ivory bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-indigo-bright/30 px-3.5 py-2 rounded-full transition-colors"
                >
                  {e.title.split(' ').slice(0, 2).join(' ')}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-dim leading-relaxed pt-1">
            In-app alerts show a banner while you're using ArrowDEX. System notifications additionally reach you through your
            device's real notification center when the tab isn't focused — same as a native app.
          </p>
        </div>

        <div className="glass p-5 sm:p-7 hover:border-indigo-bright/20 border border-transparent transition-colors">
          <div className="card-label mb-4">Preferences</div>

          <DesktopModeToggle />

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