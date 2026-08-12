'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="9" rx="2" />
        <rect x="14" y="3" width="7" height="5" rx="2" />
        <rect x="14" y="12" width="7" height="9" rx="2" />
        <rect x="3" y="16" width="7" height="5" rx="2" />
      </svg>
    ),
  },
  {
    href: '/swap',
    label: 'Swap',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" />
      </svg>
    ),
  },
  
  
  
  {
    href: '/chart',
    label: 'Chart',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 19V5M4 19h16M8 15l3-4 3 3 4-6" />
        <rect x="7" y="10" width="1.6" height="5" fill="currentColor" stroke="none" />
        <rect x="12.5" y="7" width="1.6" height="8" fill="currentColor" stroke="none" />
        <rect x="16.5" y="4" width="1.6" height="11" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  
  
  {
    href: '/bridge',
    label: 'Bridge',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 12h18M3 12c0-4 2-7 4-7M21 12c0-4-2-7-4-7M3 12c0 4 2 7 4 7M21 12c0 4-2 7-4 7" />
      </svg>
    ),
  },
  {
    href: '/pools',
    label: 'Pools',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="8" cy="8" r="4" />
        <circle cx="16" cy="16" r="4" />
      </svg>
    ),
  },
  {
    href: '/pools',
    label: 'Liquidity Pools',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="8" cy="8" r="4" />
        <circle cx="16" cy="16" r="4" />
        <path d="M11 8h2M8 11v2M16 8h2" />
      </svg>
    ),
  },
  {
    href: '/vaults',
    label: 'Vaults',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
      </svg>
    ),
  },
  {
    href: '/activity',
    label: 'Activity',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 12h4l3 8 4-16 3 8h4" />
      </svg>
    ),
  },
  {
    href: '/leaderboard',
    label: 'Leaderboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="14" width="5" height="7" rx="1" />
        <rect x="9.5" y="9" width="5" height="12" rx="1" />
        <rect x="16" y="12" width="5" height="9" rx="1" />
      </svg>
    ),
  },
  {
    href: '/docs',
    label: 'Docs',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 4h11a2 2 0 012 2v14l-4-2-4 2-4-2-3 2V6a2 2 0 012-2z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex sticky top-0 h-screen border-r border-white/5 flex-col items-center py-8 w-[88px]">
      <div className="w-[42px] h-[42px] rounded-[13px] mb-10 flex items-center justify-center bg-gradient-to-br from-indigo-bright via-indigo to-[#3a2fb8] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_28px_-6px_rgba(108,99,255,0.7)] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/fonts/tokens/arrow.png"
          alt="Arrow"
        />
      </div>

      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative w-[46px] h-[46px] rounded-[13px] mb-1.5 flex items-center justify-center transition-all ${
              active
                ? 'text-indigo-bright bg-gradient-to-br from-indigo/15 to-indigo/[0.04] shadow-[inset_0_0_0_1px_rgba(124,109,255,0.35)]'
                : 'text-dim hover:text-ivory hover:bg-white/[0.03]'
            }`}
          >
            {active && (
              <span className="absolute -left-[30px] w-[3px] h-[22px] rounded-full bg-gradient-to-b from-indigo-bright to-laser shadow-[0_0_14px_#8B7FFF]" />
            )}
            <span className="w-[19px] h-[19px]">{item.icon}</span>
          </Link>
        );
      })}

      <div className="flex-1" />

      <Link
        href="/settings"
        className="w-[46px] h-[46px] rounded-[13px] flex items-center justify-center text-dim hover:text-ivory hover:bg-white/[0.03] transition-all"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[19px] h-[19px]">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 000 1.8l.1.1a2 2 0 01-2.7 2.7l-.1-.1a1.7 1.7 0 00-1.8 0 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8 0l-.1.1a2 2 0 01-2.7-2.7l.1-.1a1.7 1.7 0 000-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 000-1.8l-.1-.1a2 2 0 012.7-2.7l.1.1a1.7 1.7 0 001.8 0h0a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8 0l.1-.1a2 2 0 012.7 2.7l-.1.1a1.7 1.7 0 000 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
        </svg>
      </Link>
    </aside>
  );
}