'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS } from './Sidebar';
import { useWallet } from '../lib/WalletContext';

const SWIPE_CLOSE_THRESHOLD = 90;

function addressToHues(address) {
  if (!address) return [255, 255];
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash << 5) - hash + address.charCodeAt(i);
    hash |= 0;
  }
  const h1 = Math.abs(hash) % 360;
  return [h1, (h1 + 55) % 360];
}

function AddressAvatar({ address, size = 34 }) {
  const [h1, h2] = addressToHues(address);
  return (
    <span
      className="rounded-full flex-shrink-0"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h1} 75% 62%), hsl(${h2} 75% 52%))` }}
    />
  );
}

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const pathname = usePathname();
  const { address, isConnected, connect } = useWallet();

  function handleTouchStart(e) {
    startXRef.current = e.touches[0].clientX;
    setDragging(true);
  }
  function handleTouchMove(e) {
    if (!dragging) return;
    const delta = e.touches[0].clientX - startXRef.current;
    if (delta < 0) setDragX(delta);
  }
  function handleTouchEnd() {
    if (!dragging) return;
    setDragging(false);
    if (dragX < -SWIPE_CLOSE_THRESHOLD) setOpen(false);
    setDragX(0);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden w-10 h-10 rounded-[10px] bg-white/[0.03] border border-white/5 flex items-center justify-center text-ivory flex-shrink-0"
        aria-label="Open menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
          <div
            className={`absolute top-0 left-0 h-full w-[82%] max-w-[320px] bg-[#0A0A10] border-r border-white/10 p-6 flex flex-col overflow-y-auto animate-drawer-in ${dragging ? '' : 'transition-transform duration-150'}`}
            style={{
              transform: `translateX(${dragX}px)`,
              paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)',
              paddingTop: 'max(env(safe-area-inset-top), 1.5rem)',
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex items-center justify-between mb-6">
              <Link href="/" onClick={() => setOpen(false)} className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center bg-gradient-to-br from-indigo-bright via-indigo to-[#3a2fb8] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_28px_-6px_rgba(108,99,255,0.7)] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/fonts/tokens/arrow.png" alt="Arrow" />
              </Link>
              <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-[10px] bg-white/5 flex items-center justify-center text-dim active:scale-90 transition-transform">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Wallet quick-glance */}
            <div className="flex items-center justify-between gap-3 bg-white/[0.03] border border-white/5 rounded-[16px] p-3.5 mb-6">
              {isConnected ? (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AddressAvatar address={address} size={30} />
                    <div className="min-w-0">
                      <div className="text-[10.5px] text-dim">Connected</div>
                      <div className="text-[13px] font-mono font-bold truncate">{address.slice(0, 6)}…{address.slice(-4)}</div>
                    </div>
                  </div>
                  <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_currentColor] flex-shrink-0" />
                </>
              ) : (
                <>
                  <span className="text-[13px] text-dim">No wallet connected</span>
                  <button
                    onClick={() => { connect(); setOpen(false); }}
                    className="bg-gradient-to-br from-indigo-bright to-indigo text-white font-semibold text-xs px-3.5 py-1.5 rounded-full shadow-glow flex-shrink-0"
                  >
                    Connect
                  </button>
                </>
              )}
            </div>

            <nav className="flex flex-col gap-1">
              {NAV_GROUPS.map((group, gi) => (
                <div key={gi} className={gi > 0 ? 'mt-2 pt-2 border-t border-white/5' : ''}>
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-3.5 px-4 py-3.5 rounded-[12px] text-[15px] font-medium transition-colors active:scale-[0.98] ${
                          active ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory hover:bg-white/[0.03]'
                        }`}
                      >
                        <span className="w-5 h-5">{item.icon}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3.5 px-4 py-3.5 rounded-[12px] text-[15px] font-medium transition-colors mt-2 border-t border-white/5 pt-5 active:scale-[0.98] ${
                  pathname === '/settings' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory hover:bg-white/[0.03]'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 000 1.8l.1.1a2 2 0 01-2.7 2.7l-.1-.1a1.7 1.7 0 00-1.8 0 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8 0l-.1.1a2 2 0 01-2.7-2.7l.1-.1a1.7 1.7 0 000-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 000-1.8l-.1-.1a2 2 0 012.7-2.7l.1.1a1.7 1.7 0 001.8 0h0a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8 0l.1-.1a2 2 0 012.7 2.7l-.1.1a1.7 1.7 0 000 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
                </svg>
                Settings
              </Link>
            </nav>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes drawerIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        .animate-fade-in { animation: fadeIn 0.18s ease-out; }
        .animate-drawer-in { animation: drawerIn 0.22s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </>
  );
}