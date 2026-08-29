'use client';

import { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Loader2,
  Sparkles,
  Repeat,
  ArrowRightLeft,
  LineChart,
  Droplets,
  Lock,
  CalendarDays,
  Trophy,
  BookOpen,
  ShieldCheck,
  Wand2,
  Check,
} from 'lucide-react';
import AppShell from '../../components/AppShell';
import { useAgentChat } from '@/lib/agent/useAgentChat';
import { useNotify } from '../../components/NotificationProvider';
import { Clock, X as XIcon } from 'lucide-react';

const EXPLORER_TX = (hash) => `https://testnet.arcscan.app/tx/${hash}`;
const EXPLORER_ADDR = (addr) => `https://testnet.arcscan.app/address/${addr}`;

const CAPABILITIES = [
  { icon: Repeat, label: 'Swap', hint: 'USDC → EURC, WUSDC → ARROW' },
  { icon: ArrowRightLeft, label: 'Bridge', hint: 'Arc, Ethereum Sepolia, Base Sepolia' },
  { icon: LineChart, label: 'Chart', hint: 'Live pool pricing' },
  { icon: Droplets, label: 'Liquidity', hint: 'Add / remove with amount' },
  { icon: Lock, label: 'Vault', hint: 'Stake, withdraw, exit' },
  { icon: CalendarDays, label: 'Activity', hint: 'Your actions by date' },
  { icon: Trophy, label: 'Leaderboard', hint: 'Your rank, fees, volume' },
  { icon: BookOpen, label: 'Docs', hint: 'Open documentation' },
];

const SUGGESTIONS = [
  'Swap 10 USDC to EURC',
  "What's the WUSDC/ARROW price?",
  'Bridge 20 USDC from Arc to Base Sepolia',
  "What's my leaderboard position?",
  'What did I do today?',
  'Stake 25 ARROW-LP',
];

// Same mark used on Swap / Vaults / Pools / Chart so every surface in the
// app reads as one protocol.
function EngineLogo({ className = 'w-6 h-6', breathe = false }) {
  return (
    <span className={`${className} relative flex-shrink-0`}>
      {breathe && (
        <span className="absolute -inset-1 rounded-full bg-indigo-bright/30 blur-md motion-safe:animate-agent-breathe" />
      )}
      <span className="relative w-full h-full flex rounded-full p-[1px] bg-gradient-to-br from-indigo-bright/70 via-laser/50 to-violetglow/70">
        <img
          src="/fonts/tokens/arrow.png"
          alt="Arrow Agent"
          className="w-full h-full rounded-full object-cover bg-black"
        />
      </span>
    </span>
  );
}

function LivePulse({ ok }) {
  return (
    <span className="relative flex h-2 w-2 flex-shrink-0">
      {ok && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />}
      <span className={`relative inline-flex rounded-full h-2 w-2 ${ok ? 'bg-success' : 'bg-dim/40'}`} />
    </span>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 2) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// Multi-step tracker for bridges (approve → burn → attestation → mint).
// Same visual grammar as the single-line receipt below: breathing icon while
// active, hairline sweep while confirming, success/failed rings on settle —
// just stacked with a connector so a 4-leg CCTP flow reads as one pipeline.
function StepRow({ step, isLast }) {
  const { label, status, hash } = step;
  const done = status === 'done';
  const active = status === 'pending';
  const failed = status === 'failed';

  return (
    <div className="relative flex gap-3">
      {!isLast && (
        <span
          className={`absolute left-[9px] top-5 w-px h-[calc(100%-4px)] transition-colors duration-500 ${
            done ? 'bg-success/30' : 'bg-white/[0.06]'
          }`}
        />
      )}
      <span
        className={`relative w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 mt-[1px] transition-colors duration-500 ${
          failed
            ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30'
            : done
            ? 'bg-success/15 text-success ring-1 ring-success/30'
            : active
            ? 'bg-indigo-bright/15 text-indigo-bright ring-1 ring-indigo-bright/30 motion-safe:animate-agent-breathe'
            : 'bg-white/[0.03] ring-1 ring-white/[0.08]'
        }`}
      >
        {failed ? (
          <XIcon size={9} strokeWidth={3} />
        ) : done ? (
          <Check size={9} strokeWidth={3} />
        ) : active ? (
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-bright" />
        ) : null}
      </span>

      <div className="flex-1 min-w-0 pb-3.5 flex items-center justify-between gap-2">
        <span className={`text-[12px] leading-none ${done || active || failed ? 'text-ivory/90' : 'text-dim/50'}`}>
          {label}
          {active && <span className="text-indigo-bright/70 ml-1.5 text-[10px] tracking-wide">in progress</span>}
        </span>
        {hash && (
          <a
            href={EXPLORER_TX(hash)}
            target="_blank"
            rel="noreferrer"
            className="text-[10.5px] font-mono text-indigo-bright hover:text-violetglow transition-colors flex-shrink-0"
          >
            {hash.slice(0, 6)}…{hash.slice(-4)} ↗
          </a>
        )}
      </div>
    </div>
  );
}

// Three visual states of one receipt: awaiting wallet approval (no hash yet),
// confirming (hash exists, not mined), confirmed/failed (mined) — same card
// shape throughout so the upgrade from one to the next reads as one
// continuous beat, not a layout jump. Bridges branch into a leg-by-leg
// tracker (via `steps`) instead of the single-hash line.
function TxReceipt({ status, txHash, steps }) {
  // Bridge / multi-step path
  if (steps && steps.length) {
    const failed = status === 'failed';
    return (
      <div
        className={`relative w-full rounded-[14px] bg-black/30 border px-3.5 pt-3.5 pb-1 overflow-hidden transition-colors duration-500 ${
          failed ? 'border-rose-500/25' : status === 'confirmed' ? 'border-success/20' : 'border-indigo-bright/25'
        }`}
      >
        {status === 'confirming' && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-bright/[0.06] to-transparent w-1/2 motion-safe:animate-agent-hairline" />
          </div>
        )}
        <div className="relative">
          {steps.map((s, i) => (
            <StepRow key={s.key} step={s} isLast={i === steps.length - 1} />
          ))}
        </div>
      </div>
    );
  }

  // Single-hash path (swap, liquidity, vault, etc.)
  if (status === 'awaiting') {
    return (
      <div className="w-full rounded-[14px] bg-black/30 border border-indigo-bright/20 px-3.5 py-2.5 flex items-center gap-2.5">
        <span className="w-5 h-5 rounded-full bg-indigo-bright/15 text-indigo-bright flex items-center justify-center flex-shrink-0 motion-safe:animate-agent-breathe">
          <Wand2 size={11} strokeWidth={2.4} />
        </span>
        <span className="text-[11.5px] text-ivory/70">Waiting for wallet approval…</span>
      </div>
    );
  }

  const confirming = status === 'confirming';
  const failed = status === 'failed';

  return (
    <div
      className={`relative w-full rounded-[14px] bg-black/30 border px-3.5 py-2.5 flex items-center justify-between gap-2 overflow-hidden transition-colors duration-500 ${
        failed ? 'border-rose-500/25' : confirming ? 'border-indigo-bright/25' : 'border-success/20'
      }`}
    >
      {confirming && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-bright/[0.08] to-transparent w-1/2 motion-safe:animate-agent-hairline" />
        </div>
      )}
      <div className="relative flex items-center gap-2 min-w-0">
        <span
          className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-500 ${
            failed ? 'bg-rose-500/15 text-rose-400' : confirming ? 'bg-indigo-bright/15 text-indigo-bright' : 'bg-success/15 text-success'
          }`}
        >
          {failed ? (
            <XIcon size={11} strokeWidth={3} />
          ) : confirming ? (
            <Clock size={11} className="motion-safe:animate-agent-breathe" strokeWidth={2.4} />
          ) : (
            <Check size={11} strokeWidth={3} />
          )}
        </span>
        <span className="text-[11px] text-ivory/80 font-mono truncate">
          {txHash ? `${txHash.slice(0, 8)}…${txHash.slice(-6)}` : '—'}
        </span>
        {confirming && <span className="text-[10px] text-indigo-bright/70 flex-shrink-0 tracking-wide">confirming</span>}
      </div>
      {txHash && (
        <a
          href={EXPLORER_TX(txHash)}
          target="_blank"
          rel="noreferrer"
          className="relative text-[11px] font-semibold text-indigo-bright hover:text-violetglow transition-colors flex-shrink-0"
        >
          View ↗
        </a>
      )}
    </div>
  );
}

export default function AgentPage() {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { messages, pending, send, address } = useAgentChat();
  const scrollRef = useRef(null);
  const notify = useNotify();
  const notifiedRef = useRef(new Set());
  const sessionStartRef = useRef(Date.now());

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  // Fire a notification the moment the agent actually executes something —
  // same event, same shape as the toast Swap raises on a filled trade.
  useEffect(() => {
    messages.forEach((m, i) => {
      if (m.role === 'user' || !m.txHash || notifiedRef.current.has(i)) return;
      notifiedRef.current.add(i);
      notify({
        type: m.kind || 'agent',
        title: m.title || 'Agent action complete',
        message: m.text || 'Arrow Agent executed your request.',
        txHash: m.txHash,
      });
    });
  }, [messages, notify]);

  function submit(text) {
    const val = text ?? input;
    if (!val.trim()) return;
    send(val);
    setInput('');
  }

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — silently ignore */ }
  }

  const empty = !messages || messages.length === 0;

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6 lg:gap-8">
        {/* ── Main column ─────────────────────────────────────────── */}
        <div>
          {/* Header */}
          <div className="mb-6 motion-safe:animate-agent-rise" style={{ animationDelay: '0ms' }}>
            <div className="card-label mb-3 tracking-[0.22em] flex items-center gap-2">
              <span className="w-4 h-px bg-gradient-to-r from-transparent to-indigo-bright/80" />
              <Sparkles size={11} className="text-indigo-bright" />
              Arrow Intelligence
            </div>
            <h1 className="text-[32px] sm:text-[40px] font-extrabold tracking-tight leading-[1.08] bg-clip-text text-transparent bg-gradient-to-br from-white via-ivory to-violetglow/80">
              One line in.<br className="hidden sm:block" /> The right transaction out.
            </h1>
            <p className="text-dim text-[13.5px] mt-3 max-w-lg leading-relaxed">
              Swap, bridge, stake, check prices, or pull your activity — the agent reads your wallet&apos;s connection and executes for real, right from this conversation.
            </p>
          </div>

          {/* Agent Engine badge — same disclosure pattern as ArrowSwap Engine, agent-flavored */}
          <div className="relative mb-5 motion-safe:animate-agent-rise" style={{ animationDelay: '60ms' }}>
            <div className="absolute inset-0 rounded-[16px] overflow-hidden pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-r from-white/[0.04] via-white/[0.02] to-transparent" />
              <div className="absolute inset-0 opacity-[0.5] motion-safe:animate-agent-sheen bg-[linear-gradient(110deg,transparent_20%,rgba(139,127,255,0.10)_45%,transparent_70%)] bg-[length:200%_100%]" />
            </div>
            <button
              onClick={() => setEngineOpen((v) => !v)}
              className="relative w-full flex items-center justify-between gap-2 border border-white/[0.07] hover:border-indigo-bright/30 rounded-[16px] px-4 py-3.5 backdrop-blur-sm transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <EngineLogo className="w-8 h-8" breathe />
                <div className="text-left min-w-0">
                  <div className="text-[13.5px] font-bold flex items-center gap-1.5 text-ivory">
                    Arrow Agent Engine
                    <ShieldCheck size={13} className="text-indigo-bright flex-shrink-0" strokeWidth={2.2} />
                  </div>
                  <div className="text-[11px] text-dim mt-0.5 tracking-wide">Executes real transactions on Arc Testnet</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <LivePulse ok={!!address} />
                <span className="text-[11.5px] font-mono text-dim">
                  {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Wallet not connected'}
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-3.5 h-3.5 text-dim transition-transform duration-300 ${engineOpen ? 'rotate-180 text-indigo-bright' : ''}`}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </button>

            {engineOpen && (
              <div className="relative z-20 mt-2 bg-[#0A0A10]/95 backdrop-blur-xl border border-white/[0.08] rounded-[16px] p-4 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-3.5">
                  <EngineLogo className="w-10 h-10" />
                  <div>
                    <div className="text-sm font-bold text-ivory">Arrow Agent Engine</div>
                    <div className="text-[11px] text-dim">Autonomous execution layer · Arc Testnet</div>
                  </div>
                </div>

                <div className="text-[10.5px] text-dim mb-1.5 uppercase tracking-[0.14em] font-semibold">Connected wallet</div>
                <div className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-[12px] px-3.5 py-2.5 mb-3.5">
                  <span className="font-mono text-[12px] text-ivory truncate flex-1 tracking-tight">
                    {address ? `${address.slice(0, 10)}…${address.slice(-8)}` : 'No wallet connected'}
                  </span>
                  {address && (
                    <>
                      <button onClick={copyAddress} className="text-indigo-bright hover:text-violetglow text-[11px] font-semibold flex-shrink-0 transition-colors">
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                      <a href={EXPLORER_ADDR(address)} target="_blank" rel="noreferrer" className="text-indigo-bright hover:text-violetglow text-[11px] font-semibold flex-shrink-0 transition-colors">
                        View ↗
                      </a>
                    </>
                  )}
                </div>

                <div className="text-[10.5px] text-dim mb-2 uppercase tracking-[0.14em] font-semibold">Session permissions</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {CAPABILITIES.slice(0, 6).map(({ label }) => (
                    <div key={label} className="flex items-center gap-1.5 text-[11.5px] text-ivory/80">
                      <Check size={12} className="text-success flex-shrink-0" strokeWidth={2.5} />
                      {label}
                    </div>
                  ))}
                </div>
                <div className="text-[10.5px] text-dim/60 mt-3 pt-3 border-t border-white/5">
                  Session started {timeAgo(sessionStartRef.current)}
                </div>
              </div>
            )}
          </div>

          {/* ── Hero chat panel ── */}
          <div className="relative motion-safe:animate-agent-rise" style={{ animationDelay: '120ms' }}>
            {/* Aurora halo — the signature element */}
            <div
              className="absolute -inset-8 rounded-[36px] opacity-[0.55] blur-[42px] pointer-events-none motion-safe:animate-arrow-drift"
              style={{
                background: 'conic-gradient(from 180deg, rgba(108,99,255,0.28), rgba(77,138,255,0.18), rgba(185,140,255,0.28), rgba(108,99,255,0.28))',
              }}
            />
            <div
              className="absolute -inset-px rounded-[25px] opacity-40 pointer-events-none"
              style={{ background: 'linear-gradient(140deg, rgba(255,255,255,0.14), transparent 30%, transparent 70%, rgba(139,127,255,0.18))' }}
            />

            <div className="relative rounded-[24px] bg-panel/90 backdrop-blur-2xl border border-white/[0.07] shadow-[0_35px_90px_-24px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col h-[36rem]">
              {/* Hairline with slow shimmer sweep */}
              <div className="relative h-[2px] w-full flex-shrink-0 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo via-laser to-violetglow" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent w-1/3 motion-safe:animate-agent-hairline" />
              </div>

              {/* Faint grid */}
              <div
                className="absolute inset-0 opacity-[0.035] pointer-events-none"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(139,127,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139,127,255,0.5) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }}
              />
              {/* Vignette for depth */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(120% 60% at 50% 0%, rgba(139,127,255,0.06), transparent 60%)' }}
              />

              <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-6 py-6 space-y-4 [scrollbar-width:thin]">
                {empty ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-4">
                    <div className="relative mb-5">
                      <EngineLogo className="w-14 h-14 relative" breathe />
                    </div>
                    <div className="text-[15px] font-bold text-ivory mb-1.5">How can I move things for you?</div>
                    <p className="text-[12.5px] text-dim max-w-xs leading-relaxed mb-5">
                      Try a request in plain language, or pick one below to get started.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 max-w-md">
                      {SUGGESTIONS.slice(0, 4).map((s) => (
                        <button
                          key={s}
                          onClick={() => submit(s)}
                          className="text-[12px] px-3.5 py-2 rounded-full bg-white/[0.03] border border-white/[0.07] hover:border-indigo-bright/40 hover:text-indigo-bright hover:bg-indigo-bright/[0.05] transition-all text-dim"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex items-end gap-2.5 motion-safe:animate-agent-msg ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {m.role !== 'user' && <EngineLogo className="w-6 h-6 mb-0.5" />}
                      <div className={`max-w-[75%] ${m.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1.5`}>
                        <div
                          className={
                            m.role === 'user'
                              ? 'rounded-2xl rounded-br-sm px-4 py-3 text-[14px] leading-relaxed bg-gradient-to-br from-indigo-bright/25 to-indigo/15 border border-indigo-bright/25 text-ivory shadow-[0_8px_24px_-10px_rgba(108,99,255,0.5)]'
                              : `rounded-2xl rounded-bl-sm px-4 py-3 text-[14px] leading-relaxed bg-white/[0.035] border border-white/[0.07] text-ivory/90 ${m.pending ? 'animate-pulse' : ''}`
                          }
                        >
                          {m.text}
                        </div>

                        {/* Transaction receipt — single-hash line, or leg-by-leg tracker for bridges */}
                        {m.status && <TxReceipt status={m.status} txHash={m.txHash} steps={m.steps} />}

                        {m.ts && (
                          <span className="text-[10px] text-dim/50 px-1">{timeAgo(m.ts)}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {pending && (
                  <div className="flex items-end gap-2.5 justify-start">
                    <EngineLogo className="w-6 h-6 mb-0.5" breathe />
                    <div className="rounded-2xl rounded-bl-sm px-4 py-3.5 bg-white/[0.035] border border-white/[0.07] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-bright/80 motion-safe:animate-agent-dot" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-bright/80 motion-safe:animate-agent-dot" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-bright/80 motion-safe:animate-agent-dot" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="relative p-4 border-t border-white/[0.07] flex-shrink-0">
                <div
                  className={`flex items-center gap-2 rounded-full bg-black/30 border transition-all px-2 py-2 ${
                    focused ? 'border-indigo-bright/50 shadow-[0_0_0_3px_rgba(108,99,255,0.12)]' : 'border-white/[0.07]'
                  }`}
                >
                  <span className="w-8 h-8 rounded-full bg-indigo/10 text-indigo-bright flex items-center justify-center flex-shrink-0">
                    <Wand2 size={14} strokeWidth={1.8} />
                  </span>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    placeholder="Ask the agent to do something…"
                    className="flex-1 bg-transparent outline-none text-[14px] font-mono placeholder:text-dim/50 px-1 text-ivory"
                  />
                  <button
                    onClick={() => submit()}
                    disabled={pending || !input.trim()}
                    className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-bright to-indigo flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105 active:scale-95 shadow-glow flex-shrink-0"
                  >
                    <ArrowUp size={15} className="text-white" strokeWidth={2.5} />
                  </button>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-[10.5px] text-dim/60 text-center mt-2.5 tracking-wide">
                  <ShieldCheck size={11} className="text-dim/60" />
                  Arrow Agent can make mistakes. Always verify transaction details before confirming.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside className="space-y-6">
          <div className="motion-safe:animate-agent-rise" style={{ animationDelay: '160ms' }}>
            <div className="card-label mb-3">Try asking</div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="text-[12px] px-3.5 py-2 rounded-full bg-white/[0.03] border border-white/5 hover:border-indigo-bright/30 hover:text-indigo-bright hover:bg-indigo-bright/[0.04] transition-all text-dim"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="motion-safe:animate-agent-rise" style={{ animationDelay: '200ms' }}>
            <div className="card-label mb-3">Capabilities</div>
            <div className="space-y-2">
              {CAPABILITIES.map(({ icon: Icon, label, hint }) => (
                <div
                  key={label}
                  className="group flex items-start gap-3 rounded-[14px] px-3.5 py-3 bg-white/[0.02] hover:bg-white/[0.045] border border-white/5 hover:border-indigo-bright/25 transition-all hover:-translate-y-[1px] hover:shadow-[0_10px_28px_-14px_rgba(108,99,255,0.6)]"
                >
                  <span className="w-7 h-7 rounded-[9px] bg-indigo/10 text-indigo-bright flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-indigo-bright/20 group-hover:shadow-[0_0_0_3px_rgba(108,99,255,0.12)] transition-all">
                    <Icon size={14} strokeWidth={1.75} />
                  </span>
                  <div>
                    <div className="text-[13px] font-bold text-ivory">{label}</div>
                    <div className="text-[11px] text-dim mt-0.5">{hint}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <style jsx global>{`
        @keyframes arrow-drift {
          0%   { transform: rotate(0deg) scale(1); }
          50%  { transform: rotate(180deg) scale(1.06); }
          100% { transform: rotate(360deg) scale(1); }
        }
        .animate-arrow-drift {
          animation: arrow-drift 22s linear infinite;
        }

        @keyframes agent-rise {
          0%   { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-agent-rise {
          animation: agent-rise 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes agent-msg {
          0%   { opacity: 0; transform: translateY(6px) scale(0.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-agent-msg {
          animation: agent-msg 0.3s ease-out both;
        }

        @keyframes agent-dot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
        .animate-agent-dot {
          animation: agent-dot 1.1s ease-in-out infinite;
        }

        @keyframes agent-hairline {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        .animate-agent-hairline {
          animation: agent-hairline 4.5s ease-in-out infinite;
        }

        @keyframes agent-sheen {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-agent-sheen {
          animation: agent-sheen 6s linear infinite;
        }

        @keyframes agent-breathe {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50%      { opacity: 0.7; transform: scale(1.18); }
        }
        .animate-agent-breathe {
          animation: agent-breathe 2.6s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-arrow-drift,
          .animate-agent-rise,
          .animate-agent-msg,
          .animate-agent-dot,
          .animate-agent-hairline,
          .animate-agent-sheen,
          .animate-agent-breathe {
            animation: none;
          }
        }
      `}</style>
    </AppShell>
  );
}