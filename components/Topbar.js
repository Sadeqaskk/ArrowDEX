'use client';

import { useState, useRef, useEffect } from 'react';
import { useWallet } from '../lib/WalletContext';
import NetworkSelector from './NetworkSelector';
import MobileNav from './MobileNav';
import SearchBar from './SearchBar';
import MobileSearchModal from './MobileSearchModal';

export default function Topbar() {
  const { address, isConnected, connect, disconnect, network, setNetwork, walletName } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    </div>
  );
}