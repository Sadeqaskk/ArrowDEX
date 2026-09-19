"use client";
import { useState, useRef, useCallback } from "react";
import { useWallet } from "@/lib/WalletContext";
import { executeAgentAction } from "@/lib/agent/executeAction";
import { getBrowserPublicClient } from "@/lib/agent/publicClientBrowser";

const WELCOME = "I'm the Arrow Agent. Ask me to swap, bridge, check a price, add liquidity, stake, or pull your activity.";
const WELCOME_MAINNET = "I'm the Arrow Agent. On Mainnet I can bridge USDC for you — swap, liquidity, vaults and the rest are coming soon.";

// On Mainnet the only action the agent is allowed to execute.
const MAINNET_ACTIONS = new Set(["bridge"]);

export const BRIDGE_STEPS = [
  { key: "approve", label: "Approve USDC" },
  { key: "burn", label: "Burn on source chain" },
  { key: "attestation", label: "Waiting for Circle attestation" },
  { key: "mint", label: "Mint on destination chain" },
];

export function useAgentChat(options = {}) {
  const { address, isConnected, networkMode: walletMode } = useWallet();
  // Prefer the mode the page passes in, fall back to the shared wallet mode,
  // and default to testnet so nothing changes for callers that pass neither.
  const networkMode = options.networkMode ?? walletMode ?? "testnet";
  const isMainnet = networkMode === "mainnet";

  const [messages, setMessages] = useState([
    { id: "welcome", role: "agent", text: isMainnet ? WELCOME_MAINNET : WELCOME, ts: Date.now() },
  ]);
  const [pending, setPending] = useState(false);
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
          // networkMode lets the route resolve chain names ("Ethereum", "Base")
          // against the right list. A route that ignores it behaves as before.
          body: JSON.stringify({ message: userMsg, walletAddress: address, networkMode }),
        }).then((r) => r.json());

        // Hard guard, independent of the page: on Mainnet, never execute
        // anything but a bridge, even if the parser returns another action.
        if (isMainnet && res.type === "action" && !MAINNET_ACTIONS.has(res.action)) {
          setMessages((m) => [
            ...m,
            {
              id: nextId(),
              role: "agent",
              text: "On Mainnet I can only bridge right now. Swap, liquidity, vaults and the rest are coming soon — switch to Arc Testnet to use them today.",
              ts: Date.now(),
            },
          ]);
          return;
        }

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
              // The 5th argument carries the mode into executeAgentAction so a
              // bridge can pick mainnet chains and Circle's production
              // attestation API. Ignored by versions that don't read it yet.
              const result = await executeAgentAction(
                res.action,
                res.params,
                address,
                (info) => {
                  if (isBridge && info?.step) {
                    setMessages((m) =>
                      m.map((msg) => {
                        if (msg.id !== actionId) return msg;
                        const steps = msg.steps.map((s) =>
                          s.key === info.step
                            ? {
                                ...s,
                                status: info.status,
                                hash: info.hash || s.hash,
                                // Each leg can sit on a different chain (burn
                                // on source, mint on destination), so a leg
                                // may carry its own explorer base URL.
                                explorer: info.explorer || s.explorer,
                              }
                            : s
                        );
                        return { ...msg, steps, status: "confirming", statusText: info.message || msg.statusText };
                      })
                    );
                  } else if (typeof info === "string") {
                    patchMessage(actionId, { statusText: info, status: "confirming" });
                  }
                },
                { networkMode }
              );

              // executeAgentAction may return a bare hash (existing behavior)
              // or { hash, explorer } when it knows which chain the hash is on.
              const hash = typeof result === "string" ? result : result?.hash;
              const explorer = typeof result === "object" && result ? result.explorer : undefined;
              // A bridge's mint lands on the destination chain, so its result
              // can carry a receipt waiter bound to that chain's own client.
              const waitForReceipt = typeof result === "object" && result ? result.waitForReceipt : undefined;

              patchMessage(actionId, {
                txHash: hash,
                explorer,
                status: "confirming",
                statusText: "Confirming on-chain…",
              });

              if (waitForReceipt && hash) {
                const receipt = await waitForReceipt();
                if (receipt.status === "reverted") {
                  patchMessage(actionId, { pending: false, status: "failed", statusText: "Mint transaction reverted on-chain.", title: `${res.action} failed` });
                } else {
                  patchMessage(actionId, { pending: false, status: "confirmed", statusText: "Confirmed on-chain.", title: `${res.action} confirmed` });
                }
              } else if (isMainnet) {
                // getBrowserPublicClient() is an Arc Testnet client — waiting
                // on a mainnet hash with it would never find the transaction
                // and leave this stuck on "confirming". runBridge has already
                // submitted every leg by this point, so mark it done and point
                // the user at the explorer, like the Bridge page does.
                patchMessage(actionId, {
                  pending: false,
                  status: "confirmed",
                  statusText: "Submitted. Confirm the mint on the destination chain's explorer before assuming funds have arrived.",
                  title: `${res.action} submitted`,
                });
              } else if (hash) {
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
    [address, isConnected, pending, patchMessage, networkMode, isMainnet]
  );

  return { messages, pending, send, address };
}