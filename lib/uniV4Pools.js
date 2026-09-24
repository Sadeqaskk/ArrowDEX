import { createPublicClient, createWalletClient, custom, http, formatUnits, parseUnits, defineChain, encodeAbiParameters, keccak256 } from 'viem';
import { Token, Percent, CurrencyAmount } from '@uniswap/sdk-core';
import { Pool, Position, V4PositionManager } from '@uniswap/v4-sdk';
import { getActiveProvider } from './activeProvider';
import { MAINNET_CHAIN_ID, MAINNET_TOKENS_V4, UNIV4_CONTRACTS, STATE_VIEW_ABI, ERC20_ABI_V4 } from './uniV4PoolConfig';

// Local tick helpers — some published versions of @uniswap/v4-sdk don't export
// TickMath / nearestUsableTick, so we don't depend on them.
const MIN_TICK = -887272;
const MAX_TICK = 887272;

function nearestUsableTick(tick, spacing) {
  let rounded = Math.round(tick / spacing) * spacing;
  if (rounded < MIN_TICK) rounded += spacing;
  if (rounded > MAX_TICK) rounded -= spacing;
  return rounded;
}

// Must be read as a literal `process.env.NEXT_PUBLIC_…` so Next.js inlines it
// into the browser bundle. Set it in .env.local and RESTART `next dev`.
const RPC_URL = (process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL || '').trim();

const arcMainnetChain = defineChain({
  id: MAINNET_CHAIN_ID,
  name: 'Arc Mainnet',
  // Arc's native gas token is USDC with 18 decimals (only the ERC-20 interface uses 6).
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL || 'http://localhost'] } },
});

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// On Arc, USDC exists as an ERC-20 face (6 decimals) AND as the native coin (18 decimals).
// A v4 pool can be keyed on either: ERC-20 address, or the zero address (native).
const NATIVE_USDC = { address: ZERO_ADDRESS, symbol: 'USDC', name: 'USD Coin', decimals: 18, isNative: true };

// Standard Uniswap v4 fee / tickSpacing pairs.
const FEE_TIERS = [
  [3000, 60],
  [500, 10],
  [10000, 200],
  [100, 1],
];

const PERMIT2_ABI = [
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
];

const MAX_UINT160 = (1n << 160n) - 1n;

let _publicClient = null;
function getPublicClient() {
  if (RPC_URL) {
    if (!_publicClient) {
      _publicClient = createPublicClient({ chain: arcMainnetChain, transport: http(RPC_URL) });
    }
    return _publicClient;
  }
  // Fallback when no RPC URL is configured: read through the connected wallet
  // Only correct while the wallet is on Arc Mainnet (checked in getV4PoolState)
  const provider = getActiveProvider();
  if (!provider) {
    throw new Error(
      'NEXT_PUBLIC_ARC_MAINNET_RPC_URL is not set and no wallet is connected. Add it to .env.local and restart the dev server.'
    );
  }
  return createPublicClient({ chain: arcMainnetChain, transport: custom(provider) });
}

async function assertWalletOnMainnet(client) {
  if (RPC_URL) return; // reads go straight to the configured RPC, wallet chain is irrelevant
  const id = await client.getChainId();
  if (id !== MAINNET_CHAIN_ID) {
    throw new Error(
      'Your wallet is not on Arc Mainnet. Switch networks, or set NEXT_PUBLIC_ARC_MAINNET_RPC_URL in .env.local and restart the dev server.'
    );
  }
}

function getWalletClient() {
  const provider = getActiveProvider();
  if (!provider) throw new Error('No wallet connected.');
  return createWalletClient({ chain: arcMainnetChain, transport: custom(provider) });
}

async function ensureMainnetNetwork() {
  const provider = getActiveProvider();
  if (!provider) throw new Error('No wallet connected.');
  const chainIdHex = `0x${MAINNET_CHAIN_ID.toString(16)}`;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
  } catch (err) {
    if (err.code === 4902) {
      if (!RPC_URL) {
        throw new Error('Arc Mainnet is not in your wallet and NEXT_PUBLIC_ARC_MAINNET_RPC_URL is not set, so it cannot be added automatically.');
      }
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chainIdHex,
          chainName: 'Arc Mainnet',
          nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
          rpcUrls: [RPC_URL],
        }],
      });
    } else {
      throw err;
    }
  }
}

function toSdkToken(t) {
  return new Token(MAINNET_CHAIN_ID, t.address, t.decimals, t.symbol, t.name);
}

// v4 PoolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
function computePoolId(poolCfg) {
  const encoded = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
    [poolCfg.currency0.address, poolCfg.currency1.address, poolCfg.fee, poolCfg.tickSpacing, poolCfg.hooks]
  );
  return keccak256(encoded);
}

async function readPoolSlot(client, poolCfg) {
  const poolId = computePoolId(poolCfg);
  const [slot0, liquidity] = await Promise.all([
    client.readContract({ address: UNIV4_CONTRACTS.stateView, abi: STATE_VIEW_ABI, functionName: 'getSlot0', args: [poolId] }),
    client.readContract({ address: UNIV4_CONTRACTS.stateView, abi: STATE_VIEW_ABI, functionName: 'getLiquidity', args: [poolId] }),
  ]);
  return { poolId, slot0, liquidity };
}

function sortPair(a, b) {
  return a.address.toLowerCase() < b.address.toLowerCase() ? [a, b] : [b, a];
}

// USDC can be represented as the ERC-20 face or as native (zero address).
function currencyVariants(t) {
  if (t.address.toLowerCase() === MAINNET_TOKENS_V4.USDC.address.toLowerCase()) return [t, NATIVE_USDC];
  return [t];
}

const _discoveryCache = new Map();

/**
 * Looks for a real, initialized pool for this token pair when the configured
 * key isn't found. Tries the standard fee tiers, with USDC as ERC-20 or native,
 * and hooks = configured hooks or none. Read-only. Returns the key of the
 * initialized pool with the most liquidity, or null.
 */
async function discoverPool(client, baseCfg) {
  const cacheKey = baseCfg.key || `${baseCfg.currency0.symbol}-${baseCfg.currency1.symbol}`;
  if (_discoveryCache.has(cacheKey)) return _discoveryCache.get(cacheKey);

  const hookList = [...new Set([baseCfg.hooks, ZERO_ADDRESS].map((h) => h.toLowerCase()))];
  const cands = [];
  for (const v0 of currencyVariants(baseCfg.currency0)) {
    for (const v1 of currencyVariants(baseCfg.currency1)) {
      const [c0, c1] = sortPair(v0, v1);
      for (const [fee, tickSpacing] of FEE_TIERS) {
        for (const hooks of hookList) {
          cands.push({ currency0: c0, currency1: c1, fee, tickSpacing, hooks });
        }
      }
    }
  }

  const results = await Promise.all(
    cands.map(async (c) => {
      try {
        const { slot0, liquidity } = await readPoolSlot(client, c);
        if (slot0[0] === 0n) return null;
        return { ...c, liquidity, sqrtPriceX96: slot0[0] };
      } catch {
        return null;
      }
    })
  );

  const found = results.filter(Boolean).sort((a, b) => (a.liquidity > b.liquidity ? -1 : a.liquidity < b.liquidity ? 1 : 0));
  const best = found[0] || null;
  if (best) {
    // eslint-disable-next-line no-console
    console.info('[uniV4] Resolved real pool key for', baseCfg.label, {
      currency0: best.currency0.address,
      currency1: best.currency1.address,
      fee: best.fee,
      tickSpacing: best.tickSpacing,
      hooks: best.hooks,
      liquidity: best.liquidity.toString(),
      allInitializedMatches: found.length,
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn('[uniV4] No initialized pool found for', baseCfg.label, 'under standard fee tiers (zero hooks or configured hooks). The pool may not exist, or uses a custom fee / hooks contract.');
  }
  _discoveryCache.set(cacheKey, best);
  return best;
}

/**
 * Real read: current sqrtPriceX96/tick/liquidity from StateView, plus the
 * user's balances for this pool's two currencies.
 *
 * If the configured key (fee/tickSpacing/hooks/currencies) doesn't match a
 * live pool, this tries to discover the real key and updates `poolCfg` in
 * place so the rest of the app (deposit/remove) uses the real pool.
 *
 * NOTE: StateView returns zeros (it does NOT revert) for a pool ID that does
 * not exist, so `initialized: false` means "no pool with this exact key".
 */
export async function getV4PoolState(poolCfg, userAddress) {
  const client = getPublicClient();
  await assertWalletOnMainnet(client);
  const account = userAddress || ZERO_ADDRESS;

  let { poolId, slot0, liquidity } = await readPoolSlot(client, poolCfg);
  let discovered = false;

  if (!(slot0[0] > 0n)) {
    const found = await discoverPool(client, poolCfg);
    if (found) {
      Object.assign(poolCfg, {
        currency0: found.currency0,
        currency1: found.currency1,
        fee: found.fee,
        tickSpacing: found.tickSpacing,
        hooks: found.hooks,
        isNative: !!(found.currency0.isNative || found.currency1.isNative),
      });
      ({ poolId, slot0, liquidity } = await readPoolSlot(client, poolCfg));
      discovered = true;
    }
  }

  const readBalance = (cur) =>
    cur.isNative || cur.address === ZERO_ADDRESS
      ? client.getBalance({ address: account })
      : client.readContract({ address: cur.address, abi: ERC20_ABI_V4, functionName: 'balanceOf', args: [account] });

  const [bal0, bal1] = await Promise.all([readBalance(poolCfg.currency0), readBalance(poolCfg.currency1)]);

  const [sqrtPriceX96, tick, protocolFee, lpFee] = slot0;
  const balance0 = formatUnits(bal0, poolCfg.currency0.decimals);
  const balance1 = formatUnits(bal1, poolCfg.currency1.decimals);

  return {
    poolId,
    sqrtPriceX96,
    tick,
    protocolFee,
    lpFee,
    liquidity,
    balance0,
    balance1,
    balance0Raw: bal0,
    balance1Raw: bal1,
    // Same balances keyed by symbol, in case the token order in the pool is flipped
    // (e.g. native USDC sorts before cirBTC).
    balanceBySymbol: {
      [poolCfg.currency0.symbol]: balance0,
      [poolCfg.currency1.symbol]: balance1,
    },
    initialized: sqrtPriceX96 > 0n,
    discovered, // true when the real key was found automatically
    usesNative: !!(poolCfg.currency0.isNative || poolCfg.currency1.isNative),
  };
}

function buildPool(poolCfg, state) {
  return new Pool(
    toSdkToken(poolCfg.currency0),
    toSdkToken(poolCfg.currency1),
    poolCfg.fee,
    poolCfg.tickSpacing,
    poolCfg.hooks,
    state.sqrtPriceX96.toString(),
    state.liquidity.toString(),
    state.tick
  );
}

function assertNoNative(poolCfg) {
  if (poolCfg.currency0.isNative || poolCfg.currency1.isNative) {
    throw new Error(
      'This pool is keyed on native USDC (zero address). The current deposit code only supports ERC-20 pairs, so it is blocked to protect your funds.'
    );
  }
}

// v4's PositionManager spends through Permit2, so two approvals are needed:
//   1) token -> Permit2 (standard ERC-20 approve)
//   2) Permit2 -> PositionManager (Permit2.approve with an expiration)
async function approveIfNeededV4(tokenAddress, account, amount) {
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();

  const erc20Allowance = await publicClient.readContract({
    address: tokenAddress, abi: ERC20_ABI_V4, functionName: 'allowance',
    args: [account, UNIV4_CONTRACTS.permit2],
  });
  if (erc20Allowance < amount) {
    const hash = await walletClient.writeContract({
      account, chain: arcMainnetChain, address: tokenAddress, abi: ERC20_ABI_V4, functionName: 'approve',
      args: [UNIV4_CONTRACTS.permit2, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  const [p2Amount, p2Expiration] = await publicClient.readContract({
    address: UNIV4_CONTRACTS.permit2, abi: PERMIT2_ABI, functionName: 'allowance',
    args: [account, tokenAddress, UNIV4_CONTRACTS.positionManager],
  });
  const now = Math.floor(Date.now() / 1000);
  if (p2Amount < amount || Number(p2Expiration) <= now + 60) {
    const wanted = amount > MAX_UINT160 ? MAX_UINT160 : amount;
    const hash = await walletClient.writeContract({
      account, chain: arcMainnetChain, address: UNIV4_CONTRACTS.permit2, abi: PERMIT2_ABI, functionName: 'approve',
      args: [tokenAddress, UNIV4_CONTRACTS.positionManager, wanted, now + 60 * 60], // valid 1 hour
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }
}

/**
 * Mints a NEW full-range position (v4 positions are NFTs, so every mint is
 * its own position). Returns the tx hash.
 *
 * NOTE: the UI adds liquidity through lib/arrowFeeRouter.js (on-chain
 * 0.07% fee). This direct path bypasses the fee and is kept only as a fallback.
 */
export async function addV4Liquidity({ account, poolCfg, amount0, amount1, slippagePct = 1, onStatus }) {
  await ensureMainnetNetwork();

  const state = await getV4PoolState(poolCfg, account);
  if (!state.initialized) {
    throw new Error('Pool not found: no initialized pool matches this fee/tickSpacing/hooks/currency combination. Check lib/uniV4PoolConfig.js against the real pool (Initialize event on the PoolManager).');
  }
  assertNoNative(poolCfg);
  const pool = buildPool(poolCfg, state);

  const amount0Raw = parseUnits(amount0, poolCfg.currency0.decimals);
  const amount1Raw = parseUnits(amount1, poolCfg.currency1.decimals);

  onStatus?.(`Checking ${poolCfg.currency0.symbol} approval…`);
  await approveIfNeededV4(poolCfg.currency0.address, account, amount0Raw);

  onStatus?.(`Checking ${poolCfg.currency1.symbol} approval…`);
  await approveIfNeededV4(poolCfg.currency1.address, account, amount1Raw);

  const tickLower = nearestUsableTick(MIN_TICK, poolCfg.tickSpacing);
  const tickUpper = nearestUsableTick(MAX_TICK, poolCfg.tickSpacing);

  const position = Position.fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0: amount0Raw.toString(),
    amount1: amount1Raw.toString(),
    useFullPrecision: true,
  });

  onStatus?.('Adding liquidity…');
  const { calldata, value } = V4PositionManager.addCallParameters(position, {
    slippageTolerance: new Percent(Math.round(slippagePct * 100), 10_000),
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    recipient: account,
    hookData: '0x',
  });

  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account, chain: arcMainnetChain, address: UNIV4_CONTRACTS.positionManager,
    abi: [{ type: 'function', name: 'multicall', stateMutability: 'payable', inputs: [{ name: 'data', type: 'bytes[]' }], outputs: [{ name: '', type: 'bytes[]' }] }],
    functionName: 'multicall', args: [[calldata]], value: BigInt(value || 0),
  });

  const publicClient = getPublicClient();
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Removes a percentage of liquidity from an EXISTING position, identified
 * by its NFT tokenId.
 *
 * `positionSnapshot` must be { tickLower, tickUpper, liquidity } for that
 * tokenId — fetch it from PositionManager before calling this.
 */
export async function removeV4Liquidity({ account, poolCfg, tokenId, positionSnapshot, liquidityPercentBps = 10000, onStatus }) {
  await ensureMainnetNetwork();

  const state = await getV4PoolState(poolCfg, account);
  if (!state.initialized) {
    throw new Error('Pool not found: no initialized pool matches this fee/tickSpacing/hooks/currency combination. Check lib/uniV4PoolConfig.js.');
  }
  assertNoNative(poolCfg);
  const pool = buildPool(poolCfg, state);

  const position = new Position({
    pool,
    liquidity: positionSnapshot.liquidity.toString(),
    tickLower: positionSnapshot.tickLower,
    tickUpper: positionSnapshot.tickUpper,
  });

  onStatus?.('Removing liquidity…');
  const { calldata, value } = V4PositionManager.removeCallParameters(position, {
    tokenId: tokenId.toString(),
    liquidityPercentage: new Percent(liquidityPercentBps, 10000),
    slippageTolerance: new Percent(100, 10_000), // 1%
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    collectOptions: {
      expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(toSdkToken(poolCfg.currency0), 0),
      expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(toSdkToken(poolCfg.currency1), 0),
      recipient: account,
    },
  });

  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account, chain: arcMainnetChain, address: UNIV4_CONTRACTS.positionManager,
    abi: [{ type: 'function', name: 'multicall', stateMutability: 'payable', inputs: [{ name: 'data', type: 'bytes[]' }], outputs: [{ name: '', type: 'bytes[]' }] }],
    functionName: 'multicall', args: [[calldata]], value: BigInt(value || 0),
  });

  const publicClient = getPublicClient();
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}