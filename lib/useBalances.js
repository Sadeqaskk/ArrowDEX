'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPublicClient, http, formatUnits, formatEther } from 'viem';
import { getChainList } from './chains';

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
        // Chains where the native gas token IS USDC (Arc) report their USDC
        // balance straight from the native balance (18 decimals there);
        // everywhere else USDC is a separate 6-decimal ERC-20 and native
        // balance is just gas.
        usdc: chain.nativeIsUsdc
          ? formatEther(nativeBalance)
          : usdcBalance !== null
            ? formatUnits(usdcBalance, 6)
            : '0',
        native: chain.nativeIsUsdc ? null : formatEther(nativeBalance),
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
 * Reads real balances for the connected address across every chain in the
 * given network mode ('testnet' | 'mainnet'), directly from each chain's
 * public RPC — no mock data.
 *
 * Chains flagged `requiresCredentials` (currently: Arc Mainnet, during
 * Circle's private mainnet phase) are skipped rather than fetched — hitting
 * a permissioned RPC with no key just produces a confusing network error,
 * so we surface a clear "requires access" state instead.
 *
 * Chains are fetched independently: a flaky RPC on one chain no longer
 * blanks out balances for the others, and each chain retries transient
 * network failures before falling back to its last-known-good value.
 */
export function useRealBalances(address, networkMode = 'testnet') {
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

    const chainList = getChainList(networkMode);
    const fetchable = chainList.filter((c) => !c.requiresCredentials);
    const gated = chainList.filter((c) => c.requiresCredentials);

    const results = await Promise.allSettled(
      fetchable.map((chain) => fetchChainBalances(chain, address))
    );

    const byKey = {};
    let allFailed = fetchable.length === 0;
    const failedChains = [];

    results.forEach((result, i) => {
      const chain = fetchable[i];
      const r = result.status === 'fulfilled'
        ? result.value
        : { key: chain.key, name: chain.name, error: result.reason?.message || 'Failed to fetch balance' };

      if (r.error) {
        failedChains.push(r.name);
        byKey[r.key] = { ...(balancesRef.current[r.key] || { key: r.key, name: r.name }), error: r.error };
      } else {
        allFailed = false;
        byKey[r.key] = r;
      }
    });

    // Gated chains (e.g. Arc Mainnet pre-public-access) get a distinct,
    // non-error state so the UI can say "requires access" instead of
    // implying something actually broke.
    gated.forEach((chain) => {
      byKey[chain.key] = {
        key: chain.key,
        name: chain.name,
        requiresCredentials: true,
        usdc: '0',
        native: null,
        nativeSymbol: chain.nativeCurrency.symbol,
      };
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
  }, [address, networkMode]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const totalUsdc = Object.values(balances).reduce(
    (sum, b) => sum + (parseFloat(b.usdc) || 0),
    0
  );

  return { balances, totalUsdc, loading, error, lastUpdated, refetch: fetchBalances };
}