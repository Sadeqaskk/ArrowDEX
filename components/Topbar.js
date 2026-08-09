'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '../lib/WalletContext';
import NetworkSelector from './NetworkSelector';
import MobileNav from './MobileNav';
import SearchBar from './SearchBar';
import MobileSearchModal from './MobileSearchModal';
import Modal from './Modal';
import { getFaucetState, claimArrow, isFaucetConfigured } from '../lib/faucet';

export default function Topbar() {
  const { address, isConnected, connect, disconnect, network, setNetwork, walletName } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const rootRef = useRef(null);

  const [faucetOpen, setFaucetOpen] = useState(false);
  const [faucetState, setFaucetState] = useState(null);
  const faucetRef = useRef(null);

  const [faucetModalOpen, setFaucetModalOpen] = useState(false);
  const [faucetStatus, setFaucetStatus] = useState('');
  const [faucetError, setFaucetError] = useState(null);
  const [faucetDone, setFaucetDone] = useState(false);
  const [faucetTxHash, setFaucetTxHash] = useState(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setMenuOpen(false);
      if (faucetRef.current && !faucetRef.current.contains(e.target)) setFaucetOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refreshFaucet = useCallback(async () => {
    if (!isFaucetConfigured() || !isConnected) return;
    try {
      const state = await getFaucetState(address);
      setFaucetState(state);
    } catch (err) {
      console.error('Faucet state fetch failed:', err);
    }
  }, [address, isConnected]);

  useEffect(() => { refreshFaucet(); }, [refreshFaucet]);

  async function handleClaimArrow() {
    setFaucetOpen(false);
    setFaucetModalOpen(true);
    setFaucetDone(false);
    setFaucetError(null);
    setFaucetTxHash(null);
    try {
      const hash = await claimArrow({
        account: address,
        onStatus: setFaucetStatus,
      });
      setFaucetTxHash(hash);
      setFaucetDone(true);
      refreshFaucet();
    } catch (err) {
      console.error(err);
      setFaucetError(err.shortMessage || err.message || 'Claim failed.');
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 mb-6 md:mb-9">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <MobileNav />

        <div className="hidden md:block">
          <SearchBar />
        </div>

        <button
          onClick={() => setMobileSearchOpen(true)}
          className="md:hidden w-10 h-10 rounded-[10px] bg-white/[0.03] border border-white/5 flex items-center justify-center text-dim flex-shrink-0"
          aria-label="Search"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-3.5 flex-shrink-0">
        {isConnected && isFaucetConfigured() && (
          <div className="relative" ref={faucetRef}>
            <button
              onClick={() => setFaucetOpen((o) => !o)}
              className="w-10 h-10 rounded-[10px] bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 flex items-center justify-center text-dim transition-colors relative"
              aria-label="ARROW Faucet"
              title="ARROW Faucet"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M12 2.5s6.5 7.02 6.5 11.5a6.5 6.5 0 1 1-13 0C5.5 9.52 12 2.5 12 2.5z" />
              </svg>
              {faucetState && faucetState.canClaim && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_currentColor]" />
              )}
            </button>

            {faucetOpen && (
              <div className="absolute top-[calc(100%+8px)] right-0 z-30 min-w-[240px] bg-[#0E0E16] border border-white/10 rounded-[16px] shadow-2xl shadow-black/60 overflow-hidden py-1.5">
                <div className="px-4 py-3 border-b border-white/5">
                  <div className="text-[11px] text-dim">Testnet ARROW faucet</div>
                  <div className="text-sm font-mono mt-0.5">
                    {faucetState ? parseFloat(faucetState.claimAmount).toLocaleString() : '—'} ARROW
                  </div>
                  {faucetState && (
                    <div className="text-[11px] text-dim mt-1">
                      Faucet balance: {parseFloat(faucetState.faucetBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })} ARROW
                    </div>
                  )}
                  {faucetState && faucetState.secondsUntilNextClaim > 0 && (
                    <div className="text-[11px] text-dim mt-1">
                      Next claim in {Math.ceil(faucetState.secondsUntilNextClaim / 3600)}h
                    </div>
                  )}
                  {faucetState && faucetState.isEmpty && (
                    <div className="text-[11px] text-danger mt-1">Faucet is empty — ask the deployer to refill it.</div>
                  )}
                </div>
                <button
                  onClick={handleClaimArrow}
                  disabled={!faucetState || !faucetState.canClaim}
                  className="w-full text-left px-4 py-3 text-sm font-semibold text-indigo-bright hover:bg-white/[0.04] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Claim ARROW
                </button>
              </div>
            )}
          </div>
        )}

        <NetworkSelector value={network} onChange={setNetwork} />

        {isConnected ? (
          <div className="relative" ref={rootRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 sm:gap-2.5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 text-ivory font-mono text-[12px] sm:text-[13px] px-3 sm:px-[16px] py-[9px] sm:py-[10px] rounded-xl transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-success shadow-[0_0_6px_currentColor]" />
              <span className="hidden sm:inline">{address.slice(0, 6)}…{address.slice(-4)}</span>
              <span className="sm:hidden">{address.slice(0, 4)}…</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-3.5 h-3.5 opacity-60 transition-transform ${menuOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
            </button>

            {menuOpen && (
              <div className="absolute top-[calc(100%+8px)] right-0 z-30 min-w-[220px] bg-[#0E0E16] border border-white/10 rounded-[16px] shadow-2xl shadow-black/60 overflow-hidden py-1.5">
                <div className="px-4 py-3 border-b border-white/5">
                  <div className="text-[11px] text-dim">{walletName || 'Connected'}</div>
                  <div className="text-sm font-mono mt-0.5">{address.slice(0, 10)}…{address.slice(-6)}</div>
                </div>
                <button
                  onClick={() => { navigator.clipboard?.writeText(address); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-white/[0.04] transition-colors"
                >
                  Copy Address
                </button>
                <button
                  onClick={() => { disconnect(); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-3 text-sm text-danger hover:bg-danger/5 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={connect}
            className="bg-gradient-to-br from-indigo-bright to-indigo text-white font-semibold text-[13px] sm:text-sm px-4 sm:px-[22px] py-[9px] sm:py-[11px] rounded-xl shadow-glow hover:-translate-y-px transition-transform whitespace-nowrap"
          >
            Connect
          </button>
        )}
      </div>

      <MobileSearchModal open={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} />

      <Modal open={faucetModalOpen} onClose={() => setFaucetModalOpen(false)} closeable={faucetDone || !!faucetError}>
        <div className="mb-5">
          <div className="card-label mb-2">{faucetDone ? 'Complete' : faucetError ? 'Failed' : 'In Progress'}</div>
          <h2 className="text-xl font-bold">Claiming ARROW</h2>
        </div>
        {!faucetDone && !faucetError && (
          <div className="flex items-center gap-3 text-sm text-ivory">
            <span className="w-4 h-4 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin" />
            {faucetStatus}
          </div>
        )}
        {faucetDone && faucetTxHash && (
          <a href={`https://testnet.arcscan.app/tx/${faucetTxHash}`} target="_blank" rel="noreferrer" className="text-indigo-bright text-sm font-mono">
            View transaction →
          </a>
        )}
        {faucetError && (
          <div className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-[12px] p-3.5">{faucetError}</div>
        )}
        {(faucetDone || faucetError) && (
          <button onClick={() => setFaucetModalOpen(false)} className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14px] py-3.5 rounded-[13px] shadow-glow">
            Close
          </button>
        )}
      </Modal>
    </div>
  );
}