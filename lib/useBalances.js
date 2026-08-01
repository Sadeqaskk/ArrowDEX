'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPublicClient, http, formatUnits, formatEther } from 'viem';
import { CHAIN_LIST } from './chains';

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(err) {
  const msg = (err && err.message) || '';
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('ECONNRESET') ||
    msg.includes('timeout') ||
    msg.includes('rate limit') ||
    msg.includes('request limit reached')
  );
}

// Fetches one chain's balances, retrying transient network failures
// (dropped connections, flaky public RPCs) before giving up on that chain.
async function fetchChainBalances(chain, address, maxAttempts = 3) {
  let attempt = 0;
  let lastErr = null;

  while (attempt < maxAttempts) {
    try {
      const client = createPublicClient({ transport: http(chain.rpcUrl) });

      const nativeBalance = await client.getBalance({ address });

      let usdcBalance = null;
      if (chain.usdc) {
        usdcBalance = await client.readContract({
          address: chain.usdc,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [address],
        });
      }

      return {
        key: chain.key,
        name: chain.name,
        // Arc's native currency IS USDC (per chains.js, 18 decimals there);
        // other chains report native ETH separately from their 6-decimal USDC.
        usdc: chain.key === 'arcTestnet'
          ? formatEther(nativeBalance)
          : usdcBalance !== null
            ? formatUnits(usdcBalance, 6)
            : '0',
        native: chain.key === 'arcTestnet' ? null : formatEther(nativeBalance),
        nativeSymbol: chain.nativeCurrency.symbol,
        error: null,
      };
    } catch (err) {
      lastErr = err;
      attempt += 1;
      if (isTransientNetworkError(err) && attempt < maxAttempts) {
        await sleep(400 * 2 ** (attempt - 1)); // 400ms, 800ms, ...
        continue;
      }
      break;
    }
  }

  console.error(`Balance fetch failed for ${chain.name}:`, lastErr);
  return {
    key: chain.key,
    name: chain.name,
    error: lastErr?.message || 'Failed to fetch balance',
  };
}

/**
 * Reads real balances for the connected address across Arc Testnet,
 * Ethereum Sepolia, and Base Sepolia — directly from each chain's public
 * RPC, no mock data.
 *
 * - Arc Testnet: USDC is the native gas token, so its balance comes from
 *   eth_getBalance.
 * - Ethereum Sepolia / Base Sepolia: USDC is a separate ERC-20, read via
 *   balanceOf. Native ETH balance is also fetched (needed for gas).
 *
 * Chains are fetched independently: a flaky RPC on one chain no longer
 * blanks out balances for the others, and each chain retries transient
 * network failures before falling back to its last-known-good value.
 */
export function useRealBalances(address) {
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const balancesRef = useRef({});

  const fetchBalances = useCallback(async () => {
    if (!address) {
      setBalances({});
      balancesRef.current = {};
      return;
    }

    setLoading(true);
    setError(null);

    const results = await Promise.allSettled(
      CHAIN_LIST.map((chain) => fetchChainBalances(chain, address))
    );

    const byKey = { ...balancesRef.current };
    let allFailed = true;
    const failedChains = [];

    results.forEach((result, i) => {
      const chain = CHAIN_LIST[i];
      const r = result.status === 'fulfilled'
        ? result.value
        : { key: chain.key, name: chain.name, error: result.reason?.message || 'Failed to fetch balance' };

      if (r.error) {
        failedChains.push(r.name);
        // Keep the previous known-good balance for this chain, just flag the error.
        byKey[r.key] = { ...(byKey[r.key] || { key: r.key, name: r.name }), error: r.error };
      } else {
        allFailed = false;
        byKey[r.key] = r;
      }
    });

    balancesRef.current = byKey;
    setBalances(byKey);
    setLastUpdated(new Date());

    if (failedChains.length > 0) {
      setError(
        allFailed
          ? 'Failed to fetch balances — check your network connection.'
          : `Couldn't refresh: ${failedChains.join(', ')} (showing last known balance).`
      );
    }

    setLoading(false);
  }, [address]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const totalUsdc = Object.values(balances).reduce(
    (sum, b) => sum + (parseFloat(b.usdc) || 0),
    0
  );

  return { balances, totalUsdc, loading, error, lastUpdated, refetch: fetchBalances };
}