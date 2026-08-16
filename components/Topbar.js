'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../lib/WalletContext';
import NetworkSelector from './NetworkSelector';
import MobileNav from './MobileNav';
import SearchBar from './SearchBar';
import MobileSearchModal from './MobileSearchModal';
import Modal from './Modal';
import { getFaucetState, claimArrow, isFaucetConfigured } from '../lib/faucet';
import { useNotificationCenter, NOTIFICATION_TYPE_META, NotificationGlyph } from './NotificationProvider';

const EXPLORER_ADDR = (addr) => `https://testnet.arcscan.app/address/${addr}`;
const EXPLORER_TX = (hash) => `https://testnet.arcscan.app/tx/${hash}`;

// Deterministic two-tone gradient per address — same idea as Rainbow/MetaMask
// identicons, without pulling in an image-generation library.
function addressToHues(address) {
  if (!address) return [255, 255];
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash << 5) - hash + address.charCodeAt(i);
    hash |= 0;
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 55) % 360;
  return [h1, h2];
}

function AddressAvatar({ address, size = 20 }) {
  const [h1, h2] = useMemo(() => addressToHues(address), [address]);
  return (
    <span
      className="rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${h1} 75% 62%), hsl(${h2} 75% 52%))`,
      }}
    />
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function useCountdown(targetMs) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!targetMs) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  if (!targetMs) return null;
  const diff = Math.max(0, targetMs - now);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { diff, h, m, s };
}

export default function Topbar() {
  const { address, isConnected, connect, disconnect, network, setNetwork, walletName } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const rootRef = useRef(null);

  const [faucetOpen, setFaucetOpen] = useState(false);
  const [faucetState, setFaucetState] = useState(null);
  const [faucetFetchedAt, setFaucetFetchedAt] = useState(null);
  const faucetRef = useRef(null);

  const [faucetModalOpen, setFaucetModalOpen] = useState(false);
  const [faucetStep, setFaucetStep] = useState(0);
  const [faucetStatus, setFaucetStatus] = useState('');
  const [faucetError, setFaucetError] = useState(null);
  const [faucetDone, setFaucetDone] = useState(false);
  const [faucetTxHash, setFaucetTxHash] = useState(null);

  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);
  const { history, unreadCount, markAllRead, clear } = useNotificationCenter();

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setMenuOpen(false);
      if (faucetRef.current && !faucetRef.current.contains(e.target)) setFaucetOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refreshFaucet = useCallback(async () => {
    if (!isFaucetConfigured() || !isConnected) return;
    try {
      const state = await getFaucetState(address);
      setFaucetState(state);
      setFaucetFetchedAt(Date.now());
    } catch (err) {
      console.error('Faucet state fetch failed:', err);
    }
  }, [address, isConnected]);

  useEffect(() => { refreshFaucet(); }, [refreshFaucet]);

  const nextClaimAt = faucetState?.secondsUntilNextClaim > 0 && faucetFetchedAt
    ? faucetFetchedAt + faucetState.secondsUntilNextClaim * 1000
    : null;
  const countdown = useCountdown(nextClaimAt);

  async function handleClaimArrow() {
    setFaucetOpen(false);
    setFaucetModalOpen(true);
    setFaucetStep(0);
    setFaucetDone(false);
    setFaucetError(null);
    setFaucetTxHash(null);
    try {
      setFaucetStep(1);
      const hash = await claimArrow({ account: address, onStatus: setFaucetStatus });
      setFaucetTxHash(hash);
      setFaucetStep(2);
      setFaucetDone(true);
      refreshFaucet();
    } catch (err) {
      console.error(err);
      setFaucetError(err.shortMessage || err.message || 'Claim failed.');
    }
  }

  function openBell() {
    setBellOpen((o) => {
      const next = !o;
      if (next) markAllRead();
      return next;
    });
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
        {/* Notification bell */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={openBell}
            className="w-10 h-10 rounded-[10px] bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 flex items-center justify-center text-dim transition-colors relative"
            aria-label="Notifications"
            title="Notifications"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-indigo-bright text-white text-[9.5px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(124,125,255,0.6)]">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute top-[calc(100%+8px)] right-0 z-30 w-[min(340px,calc(100vw-2rem))] bg-[#0E0E16] border border-white/10 rounded-[16px] shadow-2xl shadow-black/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-sm font-bold">Notifications</span>
                {history.length > 0 && (
                  <button onClick={clear} className="text-[11px] text-dim hover:text-ivory transition-colors">Clear</button>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {history.length === 0 ? (
                  <div className="text-center py-10 px-6">
                    <div className="text-dim text-sm">No notifications yet</div>
                    <div className="text-dim/60 text-[11px] mt-1">Swap, stake, or bridge — you'll see it here first.</div>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {history.map((n) => {
                      const meta = NOTIFICATION_TYPE_META[n.type] || NOTIFICATION_TYPE_META.swap;
                      return (
                        <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                          <div
                            className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${meta.accent}1f`, color: meta.accent }}
                          >
                            <NotificationGlyph name={meta.icon} className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-ivory truncate">{n.title}</div>
                            {n.message && <div className="text-[11.5px] text-dim mt-0.5 leading-snug">{n.message}</div>}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10.5px] text-dim/70">{timeAgo(n.createdAt)}</span>
                              {n.txHash && (
                                <a href={EXPLORER_TX(n.txHash)} target="_blank" rel="noreferrer" className="text-[10.5px] font-mono font-semibold" style={{ color: meta.accent }}>
                                  View tx →
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

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
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_currentColor] animate-pulse" />
              )}
            </button>

            {faucetOpen && (
              <div className="absolute top-[calc(100%+8px)] right-0 z-30 w-[min(260px,calc(100vw-2rem))] bg-[#0E0E16] border border-white/10 rounded-[16px] shadow-2xl shadow-black/60 overflow-hidden py-1.5">
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
                  {countdown && countdown.diff > 0 && (
                    <div className="text-[11px] text-dim mt-1.5 font-mono flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-dim/50" />
                      Next claim in {String(countdown.h).padStart(2, '0')}:{String(countdown.m).padStart(2, '0')}:{String(countdown.s).padStart(2, '0')}
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
              <AddressAvatar address={address} size={16} />
              <span className="hidden sm:inline">{address.slice(0, 6)}…{address.slice(-4)}</span>
              <span className="sm:hidden">{address.slice(0, 4)}…</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-3.5 h-3.5 opacity-60 transition-transform ${menuOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
            </button>

            {menuOpen && (
              <div className="absolute top-[calc(100%+8px)] right-0 z-30 min-w-[240px] bg-[#0E0E16] border border-white/10 rounded-[16px] shadow-2xl shadow-black/60 overflow-hidden py-1.5">
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/5">
                  <AddressAvatar address={address} size={28} />
                  <div className="min-w-0">
                    <div className="text-[11px] text-dim">{walletName || 'Connected'}</div>
                    <div className="text-sm font-mono mt-0.5 truncate">{address.slice(0, 10)}…{address.slice(-6)}</div>
                  </div>
                </div>
                <button
                  onClick={() => { navigator.clipboard?.writeText(address); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-white/[0.04] transition-colors"
                >
                  Copy Address
                </button>
                <a
                  href={EXPLORER_ADDR(address)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full text-left px-4 py-3 text-sm hover:bg-white/[0.04] transition-colors"
                >
                  View on Explorer
                </a>
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
          <div className="space-y-3">
            {['Confirm in wallet', 'Submitting to Arc', 'Waiting for confirmation'].map((label, i) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                {i < faucetStep ? (
                  <span className="w-4 h-4 rounded-full bg-success/20 text-success flex items-center justify-center text-[10px]">✓</span>
                ) : i === faucetStep ? (
                  <span className="w-4 h-4 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin flex-shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-white/10 flex-shrink-0" />
                )}
                <span className={i <= faucetStep ? 'text-ivory' : 'text-dim'}>{i === faucetStep ? (faucetStatus || label) : label}</span>
              </div>
            ))}
          </div>
        )}
        {faucetDone && faucetTxHash && (
          <a href={EXPLORER_TX(faucetTxHash)} target="_blank" rel="noreferrer" className="text-indigo-bright text-sm font-mono">
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