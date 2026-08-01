'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './Sidebar';

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute top-0 left-0 h-full w-[78%] max-w-[300px] bg-[#0A0A10] border-r border-white/10 p-6 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <div className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center bg-gradient-to-br from-indigo-bright via-indigo to-[#3a2fb8] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_28px_-6px_rgba(108,99,255,0.7)] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/fonts/tokens/arrow.png" alt="Arrow" />
              </div>
              <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-[10px] bg-white/5 flex items-center justify-center text-dim">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3.5 px-4 py-3.5 rounded-[12px] text-[15px] font-medium transition-colors ${
                      active ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="w-5 h-5">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3.5 px-4 py-3.5 rounded-[12px] text-[15px] font-medium transition-colors mt-2 border-t border-white/5 pt-5 ${
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
    </>
  );
}