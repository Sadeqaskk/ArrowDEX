// lib/agent/executeAction.js
"use client";
import { executeSwap, quoteSwap, getPoolState } from "@/lib/swap";
import { findPool } from "@/lib/swapConfig";
import { addLiquidity, removeLiquidity } from "@/lib/pool";
import { stakeTokens, withdrawTokens, exitVault } from "@/lib/vault"; // ← add this
import { runBridge } from "@/lib/cctp";
import { CHAINS } from "@/lib/chains";

const CHAIN_NAME_TO_KEY = {
  "Arc": "arcTestnet",
  "Ethereum Sepolia": "ethereumSepolia",
  "Base Sepolia": "baseSepolia",
};

export async function executeAgentAction(action, params, account, onStatus) {
  if (typeof account !== "string") {
    throw new Error(`executeAgentAction expected a wallet address string, got: ${JSON.stringify(account)}`);
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
      const sourceKey = CHAIN_NAME_TO_KEY[params.fromChain];
      const destKey = CHAIN_NAME_TO_KEY[params.toChain];
      if (!sourceKey || !destKey) throw new Error(`Unsupported bridge chain: ${params.fromChain} → ${params.toChain}.`);
      const amountSubunits = BigInt(Math.round(parseFloat(params.amount) * 1_000_000));
      let mintHash = null;
      await runBridge({
        sourceChain: CHAINS[sourceKey],
        destinationChain: CHAINS[destKey],
        account,
        amount: amountSubunits,
        onStatus: (info) => {
          if (info?.hash && info.step === "mint") mintHash = info.hash;
          onStatus?.(info);
        },
      });
      return mintHash;
    }

    default:
      throw new Error(`"${action}" isn't wired up in the agent yet.`);
  }
}