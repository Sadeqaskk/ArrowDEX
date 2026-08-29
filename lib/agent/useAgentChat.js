"use client";
import { useState, useRef, useCallback } from "react";
import { useWallet } from "@/lib/WalletContext";
import { executeAgentAction } from "@/lib/agent/executeAction";
import { getBrowserPublicClient } from "@/lib/agent/publicClientBrowser";

const WELCOME = "I'm the Arrow Agent. Ask me to swap, bridge, check a price, add liquidity, stake, or pull your activity.";

export const BRIDGE_STEPS = [
  { key: "approve", label: "Approve USDC" },
  { key: "burn", label: "Burn on source chain" },
  { key: "attestation", label: "Waiting for Circle attestation" },
  { key: "mint", label: "Mint on destination chain" },
];

export function useAgentChat() {
  const [messages, setMessages] = useState([{ id: "welcome", role: "agent", text: WELCOME, ts: Date.now() }]);
  const [pending, setPending] = useState(false);
  const { address, isConnected } = useWallet();
  const idRef = useRef(1);
  const nextId = () => `m${idRef.current++}`;

  const patchMessage = useCallback((id, patch) => {
    setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, ...patch } : msg)));
  }, []);

  const send = useCallback(
    async (raw) => {
      const userMsg = raw.trim();
      if (!userMsg || pending) return;
      setMessages((m) => [...m, { id: nextId(), role: "user", text: userMsg, ts: Date.now() }]);
      setPending(true);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMsg, walletAddress: address }),
        }).then((r) => r.json());

        setMessages((m) => [...m, { id: nextId(), role: "agent", text: res.reply, ts: Date.now(), meta: res }]);

        if (res.type === "action") {
          if (!isConnected || !address) {
            setMessages((m) => [...m, { id: nextId(), role: "agent", text: "Connect your wallet first, then ask again.", ts: Date.now() }]);
          } else {
            const actionId = nextId();
            const isBridge = res.action === "bridge";

            setMessages((m) => [
              ...m,
              {
                id: actionId,
                role: "agent",
                kind: res.action,
                title: `${res.action} in progress`,
                status: "awaiting",
                statusText: "Waiting for wallet approval…",
                pending: true,
                ts: Date.now(),
                steps: isBridge ? BRIDGE_STEPS.map((s) => ({ ...s, status: null })) : null,
              },
            ]);

            try {
              const hash = await executeAgentAction(res.action, res.params, address, (info) => {
                if (isBridge && info?.step) {
                  setMessages((m) =>
                    m.map((msg) => {
                      if (msg.id !== actionId) return msg;
                      const steps = msg.steps.map((s) =>
                        s.key === info.step ? { ...s, status: info.status, hash: info.hash || s.hash } : s
                      );
                      return { ...msg, steps, status: "confirming", statusText: info.message || msg.statusText };
                    })
                  );
                } else if (typeof info === "string") {
                  patchMessage(actionId, { statusText: info, status: "confirming" });
                }
              });

              patchMessage(actionId, { txHash: hash, status: "confirming", statusText: "Confirming on-chain…" });

              if (hash) {
                const receipt = await getBrowserPublicClient().waitForTransactionReceipt({ hash });
                if (receipt.status === "reverted") {
                  patchMessage(actionId, { pending: false, status: "failed", statusText: "Transaction reverted on-chain.", title: `${res.action} failed` });
                } else {
                  patchMessage(actionId, { pending: false, status: "confirmed", statusText: "Confirmed on-chain.", title: `${res.action} confirmed` });
                }
              } else {
                patchMessage(actionId, { pending: false, status: "confirmed", statusText: "Done.", title: `${res.action} confirmed` });
              }
            } catch (e) {
              patchMessage(actionId, {
                pending: false,
                status: "failed",
                statusText: e?.shortMessage || e?.message?.slice(0, 140) || "Transaction rejected.",
                title: `${res.action} failed`,
              });
            }
          }
        }
        if (res.type === "link" && res.url) window.open(res.url, "_blank");
      } catch {
        setMessages((m) => [...m, { id: nextId(), role: "agent", text: "Something interrupted the connection. Try again.", ts: Date.now() }]);
      } finally {
        setPending(false);
      }
    },
    [address, isConnected, pending, patchMessage]
  );

  return { messages, pending, send, address };
}
