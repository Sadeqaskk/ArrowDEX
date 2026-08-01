'use client';

import Modal from './Modal';

function WalletIcon({ name }) {
  const initial = name?.[0]?.toUpperCase() || '?';
  return (
    <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-indigo-bright to-indigo flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
      {initial}
    </div>
  );
}

export default function WalletModal({ open, onClose, injectedWallets, onSelectInjected, onSelectWalletConnect, connecting, error }) {
  return (
    <Modal open={open} onClose={onClose} closeable={!connecting}>
      <div className="mb-6">
        <div className="card-label mb-2">Connect</div>
        <h2 className="text-xl font-bold">Choose a Wallet</h2>
        <p className="text-dim text-sm mt-1.5">Connect a browser extension wallet, or scan a QR code with any mobile wallet via WalletConnect.</p>
      </div>

      <div className="space-y-2.5">
        {injectedWallets.length > 0 ? (
          injectedWallets.map((w) => (
            <button
              key={w.info.uuid}
              onClick={() => onSelectInjected(w)}
              disabled={connecting}
              className="w-full flex items-center gap-3.5 p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-indigo-bright/30 rounded-[14px] transition-all disabled:opacity-50"
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-dim"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          ))
        ) : (
          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-[14px] text-center">
            <p className="text-sm text-dim leading-relaxed">No browser wallet extension found on this device.</p>
          </div>
        )}

        <button
          onClick={onSelectWalletConnect}
          disabled={connecting}
          className="w-full flex items-center gap-3.5 p-4 bg-gradient-to-br from-indigo/10 to-indigo/[0.03] hover:from-indigo/15 hover:to-indigo/[0.06] border border-indigo/25 hover:border-indigo-bright/40 rounded-[14px] transition-all disabled:opacity-50"
        >
          <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-laser to-violetglow flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-5 h-5"><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
          </div>
          <div className="text-left flex-1">
            <div className="text-sm font-bold text-indigo-bright">WalletConnect</div>
            <div className="text-[11px] text-dim">
              {injectedWallets.length === 0 ? 'No extension wallet? Scan a QR code instead' : 'Scan a QR code with any mobile wallet'}
            </div>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-indigo-bright"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      {connecting && (
        <div className="flex items-center gap-2.5 mt-5 text-sm text-dim">
          <span className="w-4 h-4 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin" />
          Waiting for wallet confirmation…
        </div>
      )}

      {error && (
        <div className="mt-5 text-sm text-danger bg-danger/10 border border-danger/25 rounded-[12px] p-3.5">{error}</div>
      )}

      <p className="text-[11px] text-dim mt-6 leading-relaxed text-center">
        By connecting, you agree this is a testnet application. Never share your seed phrase.
      </p>
    </Modal>
  );
}