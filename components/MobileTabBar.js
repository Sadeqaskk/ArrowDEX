'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '../lib/WalletContext';
import { NAV_GROUPS, NAV_ITEMS } from './Sidebar';
import DesktopModeToggle from './DesktopModeToggle';

// The 4 primary destinations shown as always-visible tabs — chosen to match
// the four things the Docs page calls out as "real and live today"
// (Swap, Bridge, Pools, Vaults), anchored by Dashboard. Everything else
// (Chart, Activity, Leaderboard, Docs, Settings) lives in the More sheet.
const PRIMARY_HREFS = ['/', '/swap', '/pools', '/vaults'];

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

function AddressAvatar({ address, size = 32 }) {
  const [h1, h2] = addressToHues(address);
  return (
    <span
      className="rounded-full flex-shrink-0"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h1} 75% 62%), hsl(${h2} 75% 52%))` }}
    />
  );
}

export default function MobileTabBar() {
  const pathname = usePathname();
  const { address, isConnected, connect } = useWallet();
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryTabs = useMemo(
    () => PRIMARY_HREFS.map((href) => NAV_ITEMS.find((n) => n.href === href)).filter(Boolean),
    []
  );
  const overflowItems = useMemo(
    () => NAV_ITEMS.filter((n) => !PRIMARY_HREFS.includes(n.href)),
    []
  );

  const isMoreActive = moreOpen || overflowItems.some((n) => n.href === pathname) || pathname === '/settings';

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl bg-[#0A0A10]/85 border-t border-white/10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch justify-around px-1">
          {primaryTabs.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 active:scale-90 transition-transform"
              >
                <span className={`w-[22px] h-[22px] transition-colors ${active ? 'text-indigo-bright' : 'text-dim'}`}>
                  {item.icon}
                </span>
                <span className={`text-[10px] font-semibold transition-colors ${active ? 'text-indigo-bright' : 'text-dim'}`}>
                  {item.label}
                </span>
                {active && <span className="w-1 h-1 rounded-full bg-indigo-bright shadow-[0_0_6px_currentColor] -mt-0.5" />}
              </Link>
            );
          })}

          <button
            onClick={() => setMoreOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 active:scale-90 transition-transform"
          >
            <span className={`w-[22px] h-[22px] transition-colors ${isMoreActive ? 'text-indigo-bright' : 'text-dim'}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></svg>
            </span>
            <span className={`text-[10px] font-semibold transition-colors ${isMoreActive ? 'text-indigo-bright' : 'text-dim'}`}>More</span>
            {isMoreActive && <span className="w-1 h-1 rounded-full bg-indigo-bright shadow-[0_0_6px_currentColor] -mt-0.5" />}
          </button>
        </div>
      </nav>

      {/* More sheet — bottom sheet, same visual language as the transaction Modal */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute bottom-0 left-0 right-0 glass hero-ring rounded-t-[28px] p-5 pt-3 max-h-[80vh] overflow-y-auto animate-sheet-up"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
          >
            <div className="flex justify-center pb-4">
              <span className="w-9 h-1.5 rounded-full bg-white/15" />
            </div>

            {/* Wallet quick-glance — prime real estate, worth surfacing here */}
            <div className="flex items-center justify-between gap-3 bg-white/[0.03] border border-white/5 rounded-[16px] p-4 mb-5">
              {isConnected ? (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    <AddressAvatar address={address} size={34} />
                    <div className="min-w-0">
                      <div className="text-[11px] text-dim">Connected</div>
                      <div className="text-sm font-mono font-bold truncate">{address.slice(0, 8)}…{address.slice(-6)}</div>
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_currentColor] flex-shrink-0" />
                </>
              ) : (
                <>
                  <span className="text-sm text-dim">No wallet connected</span>
                  <button
                    onClick={() => { connect(); setMoreOpen(false); }}
                    className="bg-gradient-to-br from-indigo-bright to-indigo text-white font-semibold text-xs px-4 py-2 rounded-full shadow-glow flex-shrink-0"
                  >
                    Connect
                  </button>
                </>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2.5 mb-2">
              {overflowItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center justify-center gap-2 py-4 rounded-[16px] transition-colors active:scale-95 ${
                      active ? 'bg-indigo/15 text-indigo-bright' : 'bg-white/[0.02] text-dim hover:bg-white/[0.04] hover:text-ivory'
                    }`}
                  >
                    <span className="w-5 h-5">{item.icon}</span>
                    <span className="text-[11px] font-semibold text-center leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <Link
              href="/settings"
              onClick={() => setMoreOpen(false)}
              className={`flex items-center gap-3.5 px-4 py-3.5 mt-1 rounded-[14px] text-[14.5px] font-semibold transition-colors ${
                pathname === '/settings' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory hover:bg-white/[0.03]'
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 000 1.8l.1.1a2 2 0 01-2.7 2.7l-.1-.1a1.7 1.7 0 00-1.8 0 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8 0l-.1.1a2 2 0 01-2.7-2.7l.1-.1a1.7 1.7 0 000-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 000-1.8l-.1-.1a2 2 0 012.7-2.7l.1.1a1.7 1.7 0 001.8 0h0a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8 0l.1-.1a2 2 0 012.7 2.7l-.1.1a1.7 1.7 0 000 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
              </svg>
              Settings
            </Link>
            <div onClick={() => setMoreOpen(false)}>
              <DesktopModeToggle variant="button" />
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes sheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-sheet-up { animation: sheetUp 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </>
  );
}