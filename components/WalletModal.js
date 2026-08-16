'use client';

import { useState, useEffect } from 'react';
import Modal from './Modal';

const LAST_WALLET_KEY = 'arrowdex:last-wallet';

function WalletIcon({ name }) {
  const initial = name?.[0]?.toUpperCase() || '?';
  return (
    <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-indigo-bright to-indigo flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
      {initial}
    </div>
  );
}

function RowSpinner() {
  return <span className="w-4 h-4 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin flex-shrink-0" />;
}

export default function WalletModal({ open, onClose, injectedWallets, onSelectInjected, onSelectWalletConnect, connecting, error }) {
  // Tracks WHICH option was tapped, not just whether something is
  // connecting — lets the specific row show its own spinner instead of a
  // generic status line at the bottom, which reads as much more native.
  const [pendingKey, setPendingKey] = useState(null);
  const [lastWallet, setLastWallet] = useState(null);

  useEffect(() => {
    if (!open) return;
    try {
      setLastWallet(window.localStorage.getItem(LAST_WALLET_KEY));
    } catch { setLastWallet(null); }
  }, [open]);

  useEffect(() => {
    if (!connecting) setPendingKey(null);
  }, [connecting]);

  useEffect(() => {
    if (error) setPendingKey(null);
  }, [error]);

  function handleSelectInjected(w) {
    setPendingKey(w.info.uuid);
    try { window.localStorage.setItem(LAST_WALLET_KEY, w.info.uuid); } catch { /* ignore */ }
    onSelectInjected(w);
  }

  function handleSelectWalletConnect() {
    setPendingKey('walletconnect');
    try { window.localStorage.setItem(LAST_WALLET_KEY, 'walletconnect'); } catch { /* ignore */ }
    onSelectWalletConnect();
  }

  const recommended = injectedWallets.find((w) => w.info.uuid === lastWallet);
  const rest = injectedWallets.filter((w) => w.info.uuid !== lastWallet);

  return (
    <Modal open={open} onClose={onClose} closeable={!connecting}>
      <div className="mb-6">
        <div className="card-label mb-2">Connect</div>
        <h2 className="text-xl font-bold">Choose a Wallet</h2>
        <p className="text-dim text-sm mt-1.5">Connect a browser extension wallet, or scan a QR code with any mobile wallet via WalletConnect.</p>
      </div>

      <div className="space-y-2.5">
        {recommended && (
          <button
            onClick={() => handleSelectInjected(recommended)}
            disabled={connecting}
            className="w-full flex items-center gap-3.5 p-4 bg-gradient-to-br from-indigo/12 to-indigo/[0.04] hover:from-indigo/18 hover:to-indigo/[0.08] border border-indigo-bright/30 rounded-[14px] transition-all disabled:opacity-60 active:scale-[0.98]"
          >
            {recommended.info.icon ? (
              <img src={recommended.info.icon} alt="" className="w-10 h-10 rounded-[12px] flex-shrink-0" />
            ) : (
              <WalletIcon name={recommended.info.name} />
            )}
            <div className="text-left flex-1">
              <div className="text-sm font-bold flex items-center gap-2">
                {recommended.info.name}
                <span className="text-[9.5px] uppercase tracking-wide font-bold text-indigo-bright bg-indigo-bright/15 px-1.5 py-0.5 rounded-full">Last used</span>
              </div>
              <div className="text-[11px] text-dim">Continue with the wallet you used last time</div>
            </div>
            {pendingKey === recommended.info.uuid ? <RowSpinner /> : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-indigo-bright"><path d="M9 18l6-6-6-6" /></svg>
            )}
          </button>
        )}

        {rest.length > 0 ? (
          rest.map((w) => (
            <button
              key={w.info.uuid}
              onClick={() => handleSelectInjected(w)}
              disabled={connecting}
              className="w-full flex items-center gap-3.5 p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-indigo-bright/30 rounded-[14px] transition-all disabled:opacity-50 active:scale-[0.98]"
            >
              {w.info.icon ? (
                <img src={w.info.icon} alt="" className="w-10 h-10 rounded-[12px] flex-shrink-0" />
              ) : (
                <WalletIcon name={w.info.name} />
              )}
              <div className="text-left flex-1">
                <div className="text-sm font-bold">{w.info.name}</div>
                <div className="text-[11px] text-dim">Detected in your browser</div>
              </div>
              {pendingKey === w.info.uuid ? <RowSpinner /> : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-dim"><path d="M9 18l6-6-6-6" /></svg>
              )}
            </button>
          ))
        ) : !recommended ? (
          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-[14px] text-center">
            <p className="text-sm text-dim leading-relaxed">No browser wallet extension found on this device.</p>
          </div>
        ) : null}

        <button
          onClick={handleSelectWalletConnect}
          disabled={connecting}
          className="w-full flex items-center gap-3.5 p-4 bg-gradient-to-br from-indigo/10 to-indigo/[0.03] hover:from-indigo/15 hover:to-indigo/[0.06] border border-indigo/25 hover:border-indigo-bright/40 rounded-[14px] transition-all disabled:opacity-50 active:scale-[0.98]"
        >
          <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-laser to-violetglow flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-5 h-5"><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
          </div>
          <div className="text-left flex-1">
            <div className="text-sm font-bold text-indigo-bright flex items-center gap-2">
              WalletConnect
              <span className="text-[9.5px] uppercase tracking-wide font-bold text-dim bg-white/5 px-1.5 py-0.5 rounded-full">Mobile</span>
            </div>
            <div className="text-[11px] text-dim">
              {injectedWallets.length === 0 ? 'No extension wallet? Scan a QR code instead' : 'Scan a QR code with any mobile wallet'}
            </div>
          </div>
          {pendingKey === 'walletconnect' ? <RowSpinner /> : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-indigo-bright"><path d="M9 18l6-6-6-6" /></svg>
          )}
        </button>
      </div>

      {connecting && (
        <div className="flex items-center gap-2.5 mt-5 text-sm text-dim">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-bright animate-pulse" />
          {pendingKey === 'walletconnect'
            ? 'Waiting for you to scan and approve…'
            : `Waiting for confirmation${recommended?.info.uuid === pendingKey ? ` in ${recommended.info.name}` : ''}…`}
        </div>
      )}

      {error && (
        <div className="mt-5 text-sm text-danger bg-danger/10 border border-danger/25 rounded-[12px] p-3.5 flex items-start justify-between gap-3">
          <span>{error}</span>
        </div>
      )}

      <p className="text-[11px] text-dim mt-6 leading-relaxed text-center">
        By connecting, you agree this is a testnet application. Never share your seed phrase.
      </p>
    </Modal>
  );
}