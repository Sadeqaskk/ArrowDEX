// lib/agent/executeAction.js
"use client";
import { executeSwap, quoteSwap, getPoolState } from "@/lib/swap";
import { findPool } from "@/lib/swapConfig";
import { addLiquidity, removeLiquidity } from "@/lib/pool";
import { stakeTokens, withdrawTokens, exitVault } from "@/lib/vault"; // ← add this
import { runBridge, getPublicClient } from "@/lib/cctp";
import { CHAINS, MAINNET_CHAINS } from "@/lib/chains";

// Chain keys per network mode, by the chain's plain name. The parser may hand
// back "Ethereum Sepolia" / "Base Sepolia" even when the user typed "Ethereum"
// or "Base" on Mainnet, so names are normalized (network suffix stripped)
// before lookup and always resolved against the *selected* mode's chains —
// never the other mode's.
const CHAIN_KEYS = {
  testnet: { arc: "arcTestnet", ethereum: "ethereumSepolia", base: "baseSepolia" },
  mainnet: { arc: "arcMainnet", ethereum: "ethereumMainnet", base: "baseMainnet" },
};

function resolveChain(name, networkMode) {
  if (typeof name !== "string") return null;
  const plain = name
    .toLowerCase()
    .replace(/\b(sepolia|testnet|mainnet)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const key = CHAIN_KEYS[networkMode]?.[plain];
  if (!key) return null;
  const chains = networkMode === "mainnet" ? MAINNET_CHAINS : CHAINS;
  return chains[key] || null;
}

// Actions that are live on Mainnet. Everything else is testnet-only for now.
const MAINNET_ACTIONS = new Set(["bridge"]);

export async function executeAgentAction(action, params, account, onStatus, options = {}) {
  if (typeof account !== "string") {
    throw new Error(`executeAgentAction expected a wallet address string, got: ${JSON.stringify(account)}`);
  }

  const networkMode = options.networkMode === "mainnet" ? "mainnet" : "testnet";

  // Second line of defense behind the page and the hook: nothing but a bridge
  // runs on Mainnet, even if something upstream lets it through.
  if (networkMode === "mainnet" && !MAINNET_ACTIONS.has(action)) {
    throw new Error(`"${action}" isn't live on Mainnet yet — only bridging is. Switch to Arc Testnet to use it.`);
  }

  switch (action) {
    case "swap": {
      const pool = findPool(params.fromToken, params.toToken);
      if (!pool) throw new Error(`No pool for ${params.fromToken}/${params.toToken}.`);
      const poolState = await getPoolState(pool, account);
      const amountOut = await quoteSwap(params.fromToken, params.toToken, params.amount, poolState);
      const minAmountOut = (parseFloat(amountOut) * 0.99).toFixed(18);
      return executeSwap({
        account,
        pool,
        payTokenSymbol: params.fromToken,
        receiveTokenSymbol: params.toToken,
        amountIn: params.amount,
        minAmountOut,
        onStatus,
      });
    }

    case "addLiquidity": {
      if (params.pair !== "WUSDC/ARROW") {
        throw new Error(`Adding liquidity to ${params.pair} isn't supported yet — only WUSDC/ARROW has a liquidity pool.`);
      }
      return addLiquidity({ account, amountWusdc: params.amountA, amountArrow: params.amountB, onStatus });
    }

    case "removeLiquidity": {
      if (params.pair !== "WUSDC/ARROW") {
        throw new Error(`Removing liquidity from ${params.pair} isn't supported yet — only WUSDC/ARROW has a liquidity pool.`);
      }
      return removeLiquidity({ account, lpAmount: params.amount, onStatus });
    }

    // ↓↓↓ new cases
    case "vault_stake": {
      if (!params.amount) throw new Error("An amount is required to stake.");
      return stakeTokens({ account, amount: params.amount, onStatus });
    }

    case "vault_withdraw": {
      if (!params.amount) throw new Error("An amount is required to withdraw.");
      return withdrawTokens({ account, amount: params.amount, onStatus });
    }

    case "vault_exit": {
      return exitVault({ account, onStatus });
    }
    // ↑↑↑ new cases

    case "bridge": {
      const sourceChain = resolveChain(params.fromChain, networkMode);
      const destChain = resolveChain(params.toChain, networkMode);
      if (!sourceChain || !destChain) {
        throw new Error(
          `Unsupported ${networkMode} bridge chain: ${params.fromChain} → ${params.toChain}. ` +
          `Supported: ${networkMode === "mainnet" ? "Arc, Ethereum, Base" : "Arc, Ethereum Sepolia, Base Sepolia"}.`
        );
      }
      if (sourceChain.key === destChain.key) {
        throw new Error("Source and destination chains are the same.");
      }
      if (sourceChain.requiresCredentials || destChain.requiresCredentials) {
        const gated = sourceChain.requiresCredentials ? sourceChain : destChain;
        throw new Error(`${gated.name} isn't available for bridging yet (RPC access pending).`);
      }

      const amount = parseFloat(params.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a bridge amount greater than zero.");
      }
      const amountSubunits = BigInt(Math.round(amount * 1_000_000));

      let mintHash = null;
      await runBridge({
        sourceChain,
        destinationChain: destChain,
        account,
        amount: amountSubunits,
        // Picks Circle's production vs sandbox attestation API. A mainnet burn
        // polled against the sandbox would wait forever.
        networkMode,
        onStatus: (info) => {
          if (info?.hash && info.step === "mint") mintHash = info.hash;
          // Each leg lives on its own chain: approve + burn on the source,
          // mint on the destination. Tag the leg so its explorer link opens
          // on the right chain (attestation has no transaction).
          const legChain = info?.step === "mint" ? destChain : sourceChain;
          onStatus?.(info && typeof info === "object" ? { ...info, explorer: legChain.explorer } : info);
        },
      });

      return {
        hash: mintHash,
        explorer: destChain.explorer,
        // The mint happens on the destination chain, so wait for its receipt
        // there — not on the app's default (Arc Testnet) client.
        waitForReceipt: mintHash
          ? () => getPublicClient(destChain).waitForTransactionReceipt({ hash: mintHash })
          : undefined,
      };
    }

    default:
      throw new Error(`"${action}" isn't wired up in the agent yet.`);
  }
}