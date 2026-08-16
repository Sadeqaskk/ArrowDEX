'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export const PREFS_KEY = 'arrow-dex-preferences';

export function getPreferences() {
  if (typeof window === 'undefined') return { notifications: true, defaultSlippage: 0.5 };
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}');
    return { notifications: true, defaultSlippage: 0.5, ...saved };
  } catch {
    return { notifications: true, defaultSlippage: 0.5 };
  }
}

export function savePreferences(partial) {
  if (typeof window === 'undefined') return;
  const merged = { ...getPreferences(), ...partial };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  } catch { /* storage unavailable */ }
  return merged;
}

// ── Visual language per event type — icon + accent color, matched to the
// same palette used across Swap/Pools/Vaults/Bridge so a notification for
// "Stake" reads the same indigo/success language as the Vaults page itself.
const TYPE_META = {
  swap: { label: 'Swap', accent: '#8B7FFF', icon: 'swap' },
  bridge: { label: 'Bridge', accent: '#4D8AFF', icon: 'bridge' },
  wrap: { label: 'Wrap', accent: '#8B7FFF', icon: 'wrap' },
  unwrap: { label: 'Unwrap', accent: '#8B7FFF', icon: 'wrap' },
  addLiquidity: { label: 'Liquidity Added', accent: '#5FE0A8', icon: 'droplet' },
  removeLiquidity: { label: 'Liquidity Removed', accent: '#E0A672', icon: 'droplet' },
  stake: { label: 'Staked', accent: '#8B7FFF', icon: 'lock' },
  withdraw: { label: 'Withdrawn', accent: '#E0A672', icon: 'unlock' },
  claim: { label: 'Rewards Claimed', accent: '#FFD37A', icon: 'star' },
  exit: { label: 'Exited Vault', accent: '#E0A672', icon: 'unlock' },
  error: { label: 'Transaction Failed', accent: '#FF6B6B', icon: 'alert' },
};

function Glyph({ name, className = 'w-4 h-4' }) {
  const p = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, className, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'swap': return <svg {...p}><path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" /></svg>;
    case 'bridge': return <svg {...p}><path d="M4 12h16M4 12a4 4 0 014-4M20 12a4 4 0 00-4-4M4 12a4 4 0 004 4M20 12a4 4 0 01-4 4" /></svg>;
    case 'wrap': return <svg {...p}><path d="M17 2l4 4-4 4M3 12v-2a4 4 0 014-4h14M7 22l-4-4 4-4M21 12v2a4 4 0 01-4 4H3" /></svg>;
    case 'droplet': return <svg {...p}><path d="M12 2s7 7.5 7 12a7 7 0 11-14 0c0-4.5 7-12 7-12z" /></svg>;
    case 'lock': return <svg {...p}><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>;
    case 'unlock': return <svg {...p}><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 017.8-1.3" /></svg>;
    case 'star': return <svg {...p} fill="currentColor" stroke="none"><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" /></svg>;
    case 'alert': return <svg {...p}><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="9" /></svg>;
  }
}

const NotificationContext = createContext(null);
const NotificationCenterContext = createContext(null);

export function useNotify() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    // Fail soft — a page calling this outside the provider shouldn't crash a
    // real transaction flow over a missing toast.
    return () => {};
  }
  return ctx;
}

// Separate from useNotify() so existing `const notify = useNotify()` call
// sites keep working untouched — this just adds a read side (bell icon,
// notification center dropdown) on top of the same event stream.
export function useNotificationCenter() {
  const ctx = useContext(NotificationCenterContext);
  return ctx || { history: [], unreadCount: 0, markAllRead: () => {}, clear: () => {} };
}

export { TYPE_META as NOTIFICATION_TYPE_META, Glyph as NotificationGlyph };

const AUTO_DISMISS_MS = { default: 6000, error: 9000 };

function Toast({ toast, onDismiss }) {
  const meta = TYPE_META[toast.type] || TYPE_META.swap;
  const tone = toast.tone || (toast.type === 'error' ? 'error' : 'success');
  const duration = AUTO_DISMISS_MS[tone] || AUTO_DISMISS_MS.default;
  const [progress, setProgress] = useState(100);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct <= 0) {
        clearInterval(id);
        onDismiss(toast.id);
      }
    }, 50);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="pointer-events-auto w-[340px] max-w-[calc(100vw-32px)] rounded-[18px] overflow-hidden backdrop-blur-xl bg-[#0D0D14]/90 border border-white/10 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)] animate-toast-in"
      style={{ boxShadow: `0 12px 40px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04), 0 0 24px -8px ${meta.accent}44` }}
    >
      <button onClick={() => onDismiss(toast.id)} className="w-full text-left px-4 pt-3.5 pb-3 active:scale-[0.98] transition-transform">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ backgroundColor: `${meta.accent}1f`, color: meta.accent }}
          >
            <Glyph name={meta.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-dim uppercase tracking-wide">ArrowDEX · {meta.label}</span>
              <span className="text-[10.5px] text-dim/70 flex-shrink-0">now</span>
            </div>
            <div className="text-[14px] font-bold text-ivory mt-0.5 truncate">{toast.title}</div>
            {toast.message && <div className="text-[12.5px] text-dim mt-0.5 leading-snug">{toast.message}</div>}
            {toast.txHash && (
              <a
                href={`https://testnet.arcscan.app/tx/${toast.txHash}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-block text-[11.5px] font-mono font-semibold mt-1.5"
                style={{ color: meta.accent }}
              >
                View transaction →
              </a>
            )}
          </div>
        </div>
      </button>
      <div className="h-[2.5px] bg-white/5">
        <div className="h-full transition-[width] duration-75 ease-linear" style={{ width: `${progress}%`, backgroundColor: meta.accent }} />
      </div>
    </div>
  );
}

const HISTORY_MAX = 20;

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [history, setHistory] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markAllRead = useCallback(() => setUnreadCount(0), []);
  const clearHistory = useCallback(() => { setHistory([]); setUnreadCount(0); }, []);

  const notify = useCallback((payload) => {
    const prefs = getPreferences();

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const meta = TYPE_META[payload.type] || TYPE_META.swap;
    const title = payload.title || meta.label;
    const entry = { id, createdAt: Date.now(), ...payload, title };

    // History records every event regardless of the in-app-toast preference —
    // muting the banner shouldn't also erase the record of what happened.
    setHistory((prev) => [entry, ...prev].slice(0, HISTORY_MAX));
    setUnreadCount((c) => c + 1);

    if (prefs.notifications === false) return;

    setToasts((prev) => [...prev, { id, ...payload }].slice(-4)); // cap the stack at 4

    // Fire a real OS-level notification only when the tab is backgrounded —
    // when it's focused, the in-app toast above is the notification.
    if (
      typeof window !== 'undefined' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      document.hidden
    ) {
      try {
        const n = new Notification(`ArrowDEX · ${title}`, {
          body: payload.message || '',
          icon: '/fonts/tokens/arrow.png',
          tag: id,
        });
        if (payload.txHash) {
          n.onclick = () => {
            window.open(`https://testnet.arcscan.app/tx/${payload.txHash}`, '_blank');
            window.focus();
          };
        }
      } catch { /* some browsers throw if permission changed mid-session — non-fatal */ }
    }
  }, []);

  return (
    <NotificationContext.Provider value={notify}>
      <NotificationCenterContext.Provider value={{ history, unreadCount, markAllRead, clear: clearHistory }}>
        {children}
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 pointer-events-none">
          {toasts.map((t) => (
            <Toast key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
        <style jsx global>{`
          @keyframes toastIn {
            from { transform: translateY(-16px) scale(0.96); opacity: 0; }
            to { transform: translateY(0) scale(1); opacity: 1; }
          }
          .animate-toast-in { animation: toastIn 0.32s cubic-bezier(0.16, 1, 0.3, 1); }
        `}</style>
      </NotificationCenterContext.Provider>
    </NotificationContext.Provider>
  );
}