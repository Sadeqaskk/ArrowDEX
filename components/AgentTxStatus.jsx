"use client";

import { useState } from "react";

const EXPLORER_TX = (hash) => `https://testnet.arcscan.app/tx/${hash}`;

function truncateHash(hash) {
  if (!hash) return "";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function CopyHash({ hash }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(hash);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {}
      }}
      className="text-dim hover:text-ivory transition-colors flex-shrink-0"
      title="Copy hash"
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

function StepIcon({ status }) {
  if (status === "done") {
    return (
      <span className="w-5 h-5 rounded-full bg-success/15 text-success ring-1 ring-success/30 flex items-center justify-center text-[10px] flex-shrink-0 animate-[stepPop_.35s_ease-out]">
        ✓
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="relative w-5 h-5 flex-shrink-0 flex items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-indigo-bright/20 animate-ping" />
        <span className="relative w-5 h-5 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin" />
      </span>
    );
  }
  return <span className="w-5 h-5 rounded-full border border-white/10 flex-shrink-0" />;
}

function StatusGlyph({ status }) {
  if (status === "confirmed") {
    return (
      <span className="relative w-6 h-6 flex-shrink-0 flex items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-success/20 blur-[6px]" />
        <span className="relative w-6 h-6 rounded-full bg-success/15 ring-1 ring-success/40 text-success flex items-center justify-center text-[12px] animate-[stepPop_.4s_cubic-bezier(0.34,1.56,0.64,1)]">
          ✓
        </span>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="w-6 h-6 rounded-full bg-danger/15 ring-1 ring-danger/40 text-danger flex items-center justify-center text-[12px] flex-shrink-0 animate-[shakeX_.4s_ease-in-out]">
        ✕
      </span>
    );
  }
  return (
    <span className="relative w-6 h-6 flex-shrink-0 flex items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-bright to-violetglow opacity-70 animate-pulse" />
      <span className="relative w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
    </span>
  );
}

export default function AgentTxStatus({ message }) {
  const { kind, title, status, statusText, steps, txHash } = message;
  const isPending = status !== "confirmed" && status !== "failed";
  const doneCount = steps ? steps.filter((s) => s.status === "done").length : 0;

  return (
    <div className="relative rounded-[16px] p-[1px] overflow-hidden max-w-[340px]">
      {/* Rotating conic edge while pending, solid ring once resolved */}
      <div
        className={`absolute inset-0 rounded-[16px] transition-opacity duration-500 ${
          status === "failed"
            ? "bg-danger/50"
            : status === "confirmed"
            ? "bg-success/40"
            : "opacity-90 animate-[edgeSpin_3.2s_linear_infinite] [background:conic-gradient(from_0deg,theme(colors.indigo-bright),theme(colors.violetglow),theme(colors.laser),theme(colors.indigo-bright))]"
        }`}
      />

      <div className="relative bg-[#0F0E1A] rounded-[15px] p-4 overflow-hidden">
        {/* Diagonal shimmer sweep while pending */}
        {isPending && (
          <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmerSweep_2.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
        )}

        <div className="relative flex items-center gap-2.5 mb-1">
          <StatusGlyph status={status} />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-dim/70 truncate">
              {kind}
            </div>
            <div className="text-[13px] font-bold text-ivory truncate leading-tight">{title || kind}</div>
          </div>
          {isPending && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-bright flex-shrink-0 animate-pulse" />
          )}
        </div>

        <div className="text-[11.5px] text-dim truncate mb-0.5">{statusText}</div>

        {steps && (
          <>
            <div className="mt-3 mb-2 flex items-center justify-between">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <span className="px-2 text-[9.5px] font-semibold tracking-wide text-dim/60 tabular-nums">
                {doneCount}/{steps.length}
              </span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="space-y-2.5 pl-1">
              {steps.map((s) => (
                <div key={s.key} className="flex items-center gap-2.5">
                  <StepIcon status={s.status} />
                  <span className={`text-[12px] ${s.status ? "text-ivory" : "text-dim"}`}>{s.label}</span>
                  {s.hash && (
                    <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                      <a
                        href={EXPLORER_TX(s.hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10.5px] text-indigo-bright font-mono tabular-nums hover:text-violetglow transition-colors"
                      >
                        {truncateHash(s.hash)}
                      </a>
                      <CopyHash hash={s.hash} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {!steps && txHash && (
          <div className="flex items-center gap-1.5 mt-2.5">
            <a
              href={EXPLORER_TX(txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-indigo-bright font-mono tabular-nums hover:text-violetglow transition-colors"
            >
              {truncateHash(txHash)} <span className="text-dim/60">↗</span>
            </a>
            <CopyHash hash={txHash} />
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes edgeSpin {
          to {
            filter: hue-rotate(20deg);
            transform: rotate(360deg);
          }
        }
        @keyframes shimmerSweep {
          to {
            transform: translateX(100%);
          }
        }
        @keyframes stepPop {
          from {
            transform: scale(0.6);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes shakeX {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
      `}</style>
    </div>
  );
}