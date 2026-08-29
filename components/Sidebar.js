'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NAV_GROUPS = [
  {
    items: [
      { href: '/', label: 'Dashboard', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="7" height="9" rx="2" />
          <rect x="14" y="3" width="7" height="5" rx="2" />
          <rect x="14" y="12" width="7" height="9" rx="2" />
          <rect x="3" y="16" width="7" height="5" rx="2" />
        </svg>
      ) },
      { href: '/swap', label: 'Swap', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" />
        </svg>
      ) },
      { href: '/chart', label: 'Chart', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 19V5M4 19h16M8 15l3-4 3 3 4-6" />
          <rect x="7" y="10" width="1.6" height="5" fill="currentColor" stroke="none" />
          <rect x="12.5" y="7" width="1.6" height="8" fill="currentColor" stroke="none" />
          <rect x="16.5" y="4" width="1.6" height="11" fill="currentColor" stroke="none" />
        </svg>
      ) },
      { href: '/bridge', label: 'Bridge', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 12h18M3 12c0-4 2-7 4-7M21 12c0-4-2-7-4-7M3 12c0 4 2 7 4 7M21 12c0 4-2 7-4 7" />
        </svg>
      ) },
      { href: '/pools', label: 'Liquidity Pools', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="8" cy="8" r="4" />
          <circle cx="16" cy="16" r="4" />
          <path d="M11 8h2M8 11v2M16 8h2" />
        </svg>
      ) },
            { href: '/factory', label: 'Factory', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 21V9l6 4V9l6 4V9l6 4v8H3z" />
          <path d="M7 21v-4M12 21v-4M17 21v-4" />
        </svg>
      ) },
      { href: '/vaults', label: 'Vaults', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
        </svg>
      ) },
      { href: '/agent', label: 'AI Agent', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
          <rect x="7" y="7" width="10" height="10" rx="3" />
          <circle cx="9.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
          <path d="M9.5 14.5c.6.6 1.4.9 2.5.9s1.9-.3 2.5-.9" />
        </svg>
      ) },
    ],
  },
  {
    items: [
      { href: '/activity', label: 'Activity', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 12h4l3 8 4-16 3 8h4" />
        </svg>
      ) },
      { href: '/leaderboard', label: 'Leaderboard', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="14" width="5" height="7" rx="1" />
          <rect x="9.5" y="9" width="5" height="12" rx="1" />
          <rect x="16" y="12" width="5" height="9" rx="1" />
        </svg>
      ) },
    ],
  },
  {
    items: [
      { href: '/docs', label: 'Docs', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 4h11a2 2 0 012 2v14l-4-2-4 2-4-2-3 2V6a2 2 0 012-2z" />
        </svg>
      ) },
    ],
  },
];

// Flat list kept for anything elsewhere in the app importing NAV_ITEMS (e.g.
// MobileNav / SearchBar) — same items, just not grouped.
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function NavIcon({ href, label, icon, active }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`group relative w-[46px] h-[46px] rounded-[13px] mb-1.5 flex items-center justify-center transition-all active:scale-90 ${
        active
          ? 'text-indigo-bright bg-gradient-to-br from-indigo/15 to-indigo/[0.04] shadow-[inset_0_0_0_1px_rgba(124,109,255,0.35)]'
          : 'text-dim hover:text-ivory hover:bg-white/[0.03]'
      }`}
    >
      {active && (
        <span className="absolute -left-[30px] w-[3px] h-[22px] rounded-full bg-gradient-to-b from-indigo-bright to-laser shadow-[0_0_14px_#8B7FFF]" />
      )}
      <span className="w-[19px] h-[19px]">{icon}</span>

      {/* Hover tooltip — this is an icon-only rail, a floating label is the
          one thing that makes 9 unlabeled glyphs actually navigable. */}
      <span
        className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 translate-x-[-6px] opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap bg-[#0E0E16] border border-white/10 text-ivory text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] shadow-2xl shadow-black/60 z-40"
      >
        {label}
      </span>
    </Link>
  );
}

export default function Sidebar({ forceVisible = false }) {
  const pathname = usePathname();

  return (
    <aside
      className={`${forceVisible ? 'flex' : 'hidden md:flex'} sticky top-0 h-screen border-r border-white/5 flex-col items-center py-6 w-[88px] bg-gradient-to-b from-transparent via-transparent to-white/[0.01] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
    >
      <Link
        href="/"
        aria-label="Arrow DEX home"
        className="group w-[42px] h-[42px] rounded-[13px] mb-8 flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-indigo-bright via-indigo to-[#3a2fb8] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_28px_-6px_rgba(108,99,255,0.7)] overflow-hidden transition-transform hover:scale-105 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_10px_34px_-4px_rgba(108,99,255,0.85)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fonts/tokens/arrow.png" alt="Arrow DEX" className="transition-transform group-hover:scale-110" />
      </Link>

      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col items-center flex-shrink-0">
          {group.items.map((item) => (
            <NavIcon key={item.href} {...item} active={pathname === item.href} />
          ))}
          {gi < NAV_GROUPS.length - 1 && (
            <span className="w-6 h-px bg-white/5 my-2.5 flex-shrink-0" />
          )}
        </div>
      ))}

      {/* min-h-4 instead of flex-1 alone — guarantees breathing room above
          Settings even when the nav list is tall enough to need scrolling,
          instead of Settings getting crushed flush against the last icon */}
      <div className="flex-1 min-h-4" />

      <NavIcon
        href="/settings"
        label="Settings"
        active={pathname === '/settings'}
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 000 1.8l.1.1a2 2 0 01-2.7 2.7l-.1-.1a1.7 1.7 0 00-1.8 0 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8 0l-.1.1a2 2 0 01-2.7-2.7l.1-.1a1.7 1.7 0 000-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 000-1.8l-.1-.1a2 2 0 012.7-2.7l.1.1a1.7 1.7 0 001.8 0h0a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8 0l.1-.1a2 2 0 012.7 2.7l-.1.1a1.7 1.7 0 000 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
          </svg>
        }
      />
      <div className="h-2 flex-shrink-0" />
    </aside>
  );
}