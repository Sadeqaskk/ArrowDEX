"use client";
import { useState, useRef, useEffect } from "react";
import { Sparkles, X, ArrowUp, Loader2 } from "lucide-react";
import { useAgentChat } from "@/lib/agent/useAgentChat";

export default function AgentChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, pending, send } = useAgentChat();
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function submit() {
    send(input);
    setInput("");
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 font-[Inter]">
      {!open && (
        <button onClick={() => setOpen(true)} className="relative w-16 h-16 rounded-full group" aria-label="Open Arrow Agent">
          <span className="absolute inset-0 rounded-full animate-[spin_6s_linear_infinite] bg-[conic-gradient(from_0deg,#9B8CFF,#B057E8,#7C9CFF,#9B8CFF)] opacity-90 group-hover:opacity-100 transition-opacity motion-reduce:animate-none" />
          <span className="absolute inset-[2px] rounded-full bg-[#0A0A12] flex items-center justify-center">
            <Sparkles size={22} className="text-[#F5F3ED]" strokeWidth={1.5} />
          </span>
          <span className="absolute -inset-2 rounded-full bg-[#9B8CFF]/20 blur-xl -z-10 animate-pulse" />
        </button>
      )}

      {open && (
        <div className="relative w-[22rem] h-[30rem] rounded-[1.75rem] p-[1px] overflow-hidden shadow-[0_20px_60px_-15px_rgba(155,140,255,0.35)]">
          <div className="absolute inset-0 rounded-[1.75rem] animate-[spin_10s_linear_infinite] bg-[conic-gradient(from_0deg,#9B8CFF,#B057E8,#7C9CFF,#111020,#9B8CFF)] opacity-70 motion-reduce:animate-none" />
          <div className="relative h-full w-full rounded-[1.7rem] bg-[#0A0A12] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F5F3ED]/[0.06] bg-[#111020]/60 backdrop-blur">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7C9CFF] opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7C9CFF]" />
                </span>
                <span className="font-[Fraunces] text-[#F5F3ED] text-[15px] tracking-wide">Arrow Agent</span>
              </div>
              <div className="flex items-center gap-3">
                <a href="/agent" className="text-[10px] uppercase tracking-wider text-[#F5F3ED]/40 hover:text-[#9B8CFF] transition-colors">Expand</a>
                <button onClick={() => setOpen(false)} className="text-[#F5F3ED]/40 hover:text-[#F5F3ED] transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 [scrollbar-width:thin]">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] leading-relaxed bg-gradient-to-br from-[#9B8CFF]/25 to-[#B057E8]/15 border border-[#9B8CFF]/20 text-[#F5F3ED]"
                        : `max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-[13px] leading-relaxed bg-[#17152A] border border-[#F5F3ED]/[0.06] text-[#F5F3ED]/90 ${m.pending ? "animate-pulse" : ""}`
                    }
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {pending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-[#17152A] border border-[#F5F3ED]/[0.06]">
                    <Loader2 size={13} className="animate-spin text-[#9B8CFF]" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[#F5F3ED]/[0.06] bg-[#111020]/60 backdrop-blur">
              <div className="flex items-center gap-2 rounded-full bg-[#17152A] border border-[#F5F3ED]/[0.08] focus-within:border-[#9B8CFF]/50 transition-colors px-1.5 py-1.5">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="Swap 100 USDC to EURC…"
                  className="flex-1 bg-transparent outline-none text-[13px] text-[#F5F3ED] placeholder:text-[#F5F3ED]/30 font-[JetBrains_Mono] px-2.5"
                />
                <button
                  onClick={submit}
                  disabled={pending || !input.trim()}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-[#9B8CFF] to-[#B057E8] flex items-center justify-center disabled:opacity-30 transition-opacity"
                >
                  <ArrowUp size={14} className="text-[#0A0A12]" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}