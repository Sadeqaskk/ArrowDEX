/**
 * ArrowDEX — Arc MAINNET swap support (USDC / EURC / cirBTC) via Uniswap.
 *
 * This file is additive. It does not touch lib/swap.js or lib/swapConfig.js, so
 * everything on Arc Testnet keeps working exactly as before.
 *
 * Flow on mainnet:
 *   quote  ->  Uniswap QuoterV2 (V3 pools) / V2 Router02 getAmountsOut (V2 pairs),
 *              on the amount left AFTER the ArrowDEX fee
 *   swap   ->  ArrowUniswapFeeRouter.swapV3Single / swapV3Path / swapV2
 *              (takes the ArrowDEX fee, swaps the rest through Uniswap SwapRouter02,
 *               sends the output straight to the user)
 *
 * All Uniswap addresses below come from Uniswap's official deployment file for
 * Arc (chain 5042): github.com/Uniswap/contracts/blob/main/deployments/json/5042.json
 *
 * ── DEPLOYMENT ───────────────────────────────────────────────────────────
 *   ARROW_FEE_ROUTER is the deployed ArrowUniswapFeeRouter on Arc Mainnet
 *   (tx 0x64f1a271ea544b2cb5285aba8403e3dc7f61f02f6c66810aea2ddc89f06c5537).
 *   If it is ever set back to the zero address, MAINNET_READY turns false, the
 *   Mainnet pill locks on "Soon", and the page behaves like the testnet-only version.
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  formatUnits,
  parseUnits,
  defineChain,
  encodePacked,
} from 'viem';
import { getActiveProvider } from './activeProvider';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ── Your fee router ──────────────────────────────────────────────────────
export const ARROW_FEE_ROUTER = '0x26c6365EFE436CdB0064AA48e790490F21e07FF5'; // ArrowUniswapFeeRouter, deployed on Arc Mainnet

// ── Uniswap on Arc Mainnet (official 5042.json) ──────────────────────────
export const UNI_V3_FACTORY = '0xf0db7b58379503491d857dB50AC9ece64c653918';
export const UNI_V2_FACTORY = '0x89e5DB8B5aA49aA85AC63f691524311AEB649eba';
export const UNI_V2_ROUTER02 = '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA'; // used for V2 quotes
export const UNI_SWAP_ROUTER02 = '0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77'; // constructor arg of the fee router
export const UNI_QUOTER_V2 = '0x7DfD4F31be6814D2906BDE155C3e1B146EAc1468';

// Multicall3 on Arc Mainnet (docs.arc.io contract addresses).
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

// Standard Uniswap V3 fee tiers, in hundredths of a bip: 0.01% / 0.05% / 0.3% / 1%.
const V3_FEE_TIERS = [100, 500, 3000, 10000];
const V2_FEE_PCT = 0.3; // every V2 hop costs 0.30%

// Set to false once routing works to silence the console output.
const DEBUG_ROUTING = true;

export const ARC_MAINNET = {
  chainId: 5042,
  chainIdHex: '0x13b2',
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  // Set NEXT_PUBLIC_ARC_MAINNET_RPC to a provider endpoint (QuickNode / Alchemy /
  // Blockdaemon / dRPC) if the public one rate-limits you.
  rpcUrl: process.env.NEXT_PUBLIC_ARC_MAINNET_RPC || 'https://rpc.mainnet.arc.io',
  explorer: 'https://explorer.arc.io',
};

export const mainnetExplorerTx = (hash) => `${ARC_MAINNET.explorer}/tx/${hash}`;
export const mainnetExplorerAddr = (addr) => `${ARC_MAINNET.explorer}/address/${addr}`;

// Only what is live on Arc Mainnet. No WUSDC / ARROW here on purpose.
export const MAINNET_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x3600000000000000000000000000000000000000',
    decimals: 6,
    color: 'from-[#8B7FFF] to-laser',
    logo: '/fonts/tokens/usdc.png',
    disabled: false,
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    address: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',
    decimals: 6,
    color: 'from-success to-[#2f9e7c]',
    logo: '/fonts/tokens/eurc.png',
    disabled: false,
  },
  {
    symbol: 'cirBTC',
    name: 'Circle Wrapped Bitcoin',
    address: '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0',
    decimals: 8,
    color: 'from-danger to-[#b23f5c]',
    logo: '/fonts/tokens/cirBTC.png',
    disabled: false,
  },
];

const isSet = (a) => !!a && a.toLowerCase() !== ZERO_ADDRESS;
export const MAINNET_READY = isSet(ARROW_FEE_ROUTER);

// Keep a little USDC back when the user hits MAX — USDC is also Arc's gas token.
const USDC_GAS_RESERVE = '0.1';

// ── ABIs ─────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
];

const V3_FACTORY_ABI = [
  { type: 'function', name: 'getPool', stateMutability: 'view', inputs: [{ name: 'tokenA', type: 'address' }, { name: 'tokenB', type: 'address' }, { name: 'fee', type: 'uint24' }], outputs: [{ name: 'pool', type: 'address' }] },
];

const V2_FACTORY_ABI = [
  { type: 'function', name: 'getPair', stateMutability: 'view', inputs: [{ name: 'tokenA', type: 'address' }, { name: 'tokenB', type: 'address' }], outputs: [{ name: 'pair', type: 'address' }] },
];

const V2_ROUTER_ABI = [
  { type: 'function', name: 'getAmountsOut', stateMutability: 'view', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'path', type: 'address[]' }], outputs: [{ name: 'amounts', type: 'uint256[]' }] },
];

// QuoterV2 functions are technically non-view (they revert-catch internally) but are
// meant to be called via eth_call, so they are declared `view` here.
const QUOTER_ABI = [
  {
    type: 'function', name: 'quoteExactInputSingle', stateMutability: 'view',
    inputs: [{
      name: 'params', type: 'tuple',
      components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'fee', type: 'uint24' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' },
      ],
    }],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'quoteExactInput', stateMutability: 'view',
    inputs: [{ name: 'path', type: 'bytes' }, { name: 'amountIn', type: 'uint256' }],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96AfterList', type: 'uint160[]' },
      { name: 'initializedTicksCrossedList', type: 'uint32[]' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
];

const FEE_ROUTER_ABI = [
  { type: 'function', name: 'feeBps', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function', name: 'swapV3Single', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'swapV3Path', stateMutability: 'nonpayable',
    inputs: [
      { name: 'path', type: 'bytes' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'swapV2', stateMutability: 'nonpayable',
    inputs: [
      { name: 'path', type: 'address[]' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
];

// ── Clients ──────────────────────────────────────────────────────────────
const arcMainnetChain = defineChain({
  id: ARC_MAINNET.chainId,
  name: ARC_MAINNET.name,
  nativeCurrency: ARC_MAINNET.nativeCurrency,
  rpcUrls: { default: { http: [ARC_MAINNET.rpcUrl] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: ARC_MAINNET.explorer } },
});

let _publicClient = null;
function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain: arcMainnetChain, transport: http(ARC_MAINNET.rpcUrl) });
  }
  return _publicClient;
}

function getWalletClient() {
  const provider = getActiveProvider();
  if (!provider) throw new Error('No wallet connected.');
  return createWalletClient({ chain: arcMainnetChain, transport: custom(provider) });
}

async function ensureArcMainnet() {
  const provider = getActiveProvider();
  if (!provider) throw new Error('No wallet connected.');
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC_MAINNET.chainIdHex }] });
  } catch (err) {
    if (err.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ARC_MAINNET.chainIdHex,
          chainName: ARC_MAINNET.name,
          nativeCurrency: ARC_MAINNET.nativeCurrency,
          rpcUrls: [ARC_MAINNET.rpcUrl],
          blockExplorerUrls: [ARC_MAINNET.explorer],
        }],
      });
    } else {
      throw err;
    }
  }
}

// ── Small helpers used by the page ───────────────────────────────────────
export function parseAmount(str, decimals) {
  try {
    if (!str || !(parseFloat(str) > 0)) return null;
    const v = parseUnits(str, decimals);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

export function formatRaw(raw, decimals) {
  return formatUnits(raw, decimals);
}

// Must mirror ArrowUniswapFeeRouter._collect exactly (floor division).
export function splitFee(amountInRaw, feeBps) {
  const fee = (amountInRaw * BigInt(feeBps)) / 10000n;
  return { fee, net: amountInRaw - fee };
}

// Amount for the 25% / 50% / 75% / MAX buttons. Leaves a gas reserve on USDC.
export function computeSpendable(balanceStr, token, pct) {
  const bal = parseUnits(balanceStr || '0', token.decimals);
  let usable = bal;
  if (token.symbol === 'USDC') {
    const reserve = parseUnits(USDC_GAS_RESERVE, token.decimals);
    usable = bal > reserve ? bal - reserve : 0n;
  }
  const scaled = (usable * BigInt(Math.round(pct * 100))) / 100n;
  return formatUnits(scaled, token.decimals);
}

// ── Reads ────────────────────────────────────────────────────────────────
export async function getMainnetBalances(userAddress, client = getPublicClient()) {
  const account = userAddress || ZERO_ADDRESS;
  const results = await client.multicall({
    multicallAddress: MULTICALL3_ADDRESS,
    contracts: MAINNET_TOKENS.map((t) => ({
      address: t.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [account],
    })),
  });
  const raw = {};
  const formatted = {};
  MAINNET_TOKENS.forEach((t, i) => {
    const r = results[i];
    const v = userAddress && r.status === 'success' ? r.result : 0n;
    raw[t.symbol] = v;
    formatted[t.symbol] = formatUnits(v, t.decimals);
  });
  return { raw, formatted };
}

let _feeBps = null;
export async function readFeeBps(client = getPublicClient()) {
  if (_feeBps != null) return _feeBps;
  const v = await client.readContract({ address: ARROW_FEE_ROUTER, abi: FEE_ROUTER_ABI, functionName: 'feeBps' });
  _feeBps = Number(v);
  return _feeBps;
}

// ── Pool discovery ───────────────────────────────────────────────────────
const POOL_CACHE_MS = 60_000;
const _poolCache = new Map();

// Clears cached pool lookups (used by tests and available for a manual refresh).
export function resetUniCaches() {
  _poolCache.clear();
}

const pairKey = (a, b) => [a.address, b.address].map((x) => x.toLowerCase()).sort().join(':');

// Every existing V3 pool (per fee tier) and the V2 pair for a token pair.
async function getPoolsFor(tokenA, tokenB, client) {
  const key = pairKey(tokenA, tokenB);
  const hit = _poolCache.get(key);
  if (hit && Date.now() - hit.at < POOL_CACHE_MS) return hit.value;

  const contracts = [
    ...V3_FEE_TIERS.map((fee) => ({
      address: UNI_V3_FACTORY, abi: V3_FACTORY_ABI, functionName: 'getPool',
      args: [tokenA.address, tokenB.address, fee],
    })),
    { address: UNI_V2_FACTORY, abi: V2_FACTORY_ABI, functionName: 'getPair', args: [tokenA.address, tokenB.address] },
  ];
  const results = await client.multicall({ multicallAddress: MULTICALL3_ADDRESS, allowFailure: true, contracts });

  const nonZero = (r) => r.status === 'success' && r.result && r.result.toLowerCase() !== ZERO_ADDRESS;
  const v3 = [];
  V3_FEE_TIERS.forEach((fee, i) => {
    if (nonZero(results[i])) v3.push({ fee, pool: results[i].result });
  });
  const v2Result = results[V3_FEE_TIERS.length];
  const v2 = nonZero(v2Result) ? v2Result.result : null;

  const value = { v3, v2 };

  if (DEBUG_ROUTING) {
    results.forEach((r, i) => {
      if (r.status !== 'success') {
        console.warn('[pools] call failed', tokenA.symbol, tokenB.symbol, i, r.error?.shortMessage || r.error);
      }
    });
    console.log('[pools]', tokenA.symbol, tokenB.symbol, value);
  }

  // Do not cache when any call failed, so a flaky RPC does not stick for 60s.
  const anyFailed = results.some((r) => r.status !== 'success');
  if (!anyFailed) _poolCache.set(key, { at: Date.now(), value });
  return value;
}

// Direct + 2-hop (through the third token) routes across V3 and V2.
async function buildCandidates(tokenIn, tokenOut, tokens, client) {
  const candidates = [];

  const direct = await getPoolsFor(tokenIn, tokenOut, client);
  for (const d of direct.v3) {
    candidates.push({ protocol: 'v3', tokens: [tokenIn, tokenOut], fees: [d.fee], pools: [d.pool] });
  }
  if (direct.v2) {
    candidates.push({ protocol: 'v2', tokens: [tokenIn, tokenOut], fees: [], pools: [direct.v2] });
  }

  for (const mid of tokens) {
    if (mid.symbol === tokenIn.symbol || mid.symbol === tokenOut.symbol) continue;
    const [first, second] = await Promise.all([getPoolsFor(tokenIn, mid, client), getPoolsFor(mid, tokenOut, client)]);

    for (const a of first.v3) {
      for (const b of second.v3) {
        candidates.push({ protocol: 'v3', tokens: [tokenIn, mid, tokenOut], fees: [a.fee, b.fee], pools: [a.pool, b.pool] });
      }
    }
    if (first.v2 && second.v2) {
      candidates.push({ protocol: 'v2', tokens: [tokenIn, mid, tokenOut], fees: [], pools: [first.v2, second.v2] });
    }
  }
  return candidates;
}

function encodeV3Path(candidate) {
  const types = [];
  const values = [];
  candidate.tokens.forEach((t, i) => {
    types.push('address');
    values.push(t.address);
    if (i < candidate.fees.length) {
      types.push('uint24');
      values.push(candidate.fees[i]);
    }
  });
  return encodePacked(types, values);
}

function quoteCall(candidate, amountRaw) {
  if (candidate.protocol === 'v2') {
    return {
      address: UNI_V2_ROUTER02, abi: V2_ROUTER_ABI, functionName: 'getAmountsOut',
      args: [amountRaw, candidate.tokens.map((t) => t.address)],
    };
  }
  if (candidate.tokens.length === 2) {
    return {
      address: UNI_QUOTER_V2, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle',
      args: [{
        tokenIn: candidate.tokens[0].address,
        tokenOut: candidate.tokens[1].address,
        amountIn: amountRaw,
        fee: candidate.fees[0],
        sqrtPriceLimitX96: 0n,
      }],
    };
  }
  return {
    address: UNI_QUOTER_V2, abi: QUOTER_ABI, functionName: 'quoteExactInput',
    args: [encodeV3Path(candidate), amountRaw],
  };
}

// V3 quoter returns a tuple whose first item is amountOut; V2 returns amounts[] (last = amountOut).
function readQuoteResult(candidate, result) {
  if (candidate.protocol === 'v2') return BigInt(result[result.length - 1]);
  return BigInt(result[0]);
}

async function quoteMany(candidates, amountRaw, client) {
  if (candidates.length === 0) return [];
  const results = await client.multicall({
    multicallAddress: MULTICALL3_ADDRESS,
    allowFailure: true,
    contracts: candidates.map((c) => quoteCall(c, amountRaw)),
  });
  return results.map((r, i) => {
    if (r.status !== 'success') {
      if (DEBUG_ROUTING) {
        console.warn(
          '[quote] failed',
          candidates[i].protocol,
          candidates[i].tokens.map((t) => t.symbol).join('>'),
          candidates[i].fees,
          r.error?.shortMessage || r.error,
        );
      }
      return 0n;
    }
    return readQuoteResult(candidates[i], r.result);
  });
}

/**
 * Best Uniswap route for `amountInRaw` (already net of the ArrowDEX fee).
 * Returns null when no route can fill the trade.
 */
export async function getUniQuote({ tokenIn, tokenOut, amountInRaw, tokens = MAINNET_TOKENS, client = getPublicClient() }) {
  if (!amountInRaw || amountInRaw <= 0n) return null;

  const candidates = await buildCandidates(tokenIn, tokenOut, tokens, client);
  if (DEBUG_ROUTING) {
    console.log('[route] candidates', tokenIn.symbol, '->', tokenOut.symbol, candidates.length);
  }
  if (candidates.length === 0) return null;

  const outs = await quoteMany(candidates, amountInRaw, client);
  if (DEBUG_ROUTING) {
    console.log('[route] quoted outs', outs.map((o) => o.toString()));
  }
  let bestIdx = -1;
  outs.forEach((o, i) => {
    if (o > 0n && (bestIdx === -1 || o > outs[bestIdx])) bestIdx = i;
  });
  if (bestIdx === -1) return null;

  const best = candidates[bestIdx];
  const amountOutRaw = outs[bestIdx];

  // Price impact: compare this trade's rate with a 1%-size trade on the same route.
  let priceImpactPct = null;
  const refIn = amountInRaw / 100n;
  if (refIn >= 1000n) {
    try {
      const [refOut] = await quoteMany([best], refIn, client);
      if (refOut > 0n) {
        const refRate = Number(refOut) / Number(refIn);
        const rate = Number(amountOutRaw) / Number(amountInRaw);
        priceImpactPct = Math.max(0, (1 - rate / refRate) * 100);
      }
    } catch {
      /* impact stays null */
    }
  }

  // Pool fee is fixed by the tier (V3) or 0.30% per hop (V2), summed across hops.
  const poolFeePct = best.protocol === 'v3'
    ? best.fees.reduce((sum, f) => sum + f, 0) / 10000
    : best.pools.length * V2_FEE_PCT;

  const isSingleV3 = best.protocol === 'v3' && best.tokens.length === 2;
  return {
    protocol: best.protocol,
    kind: isSingleV3 ? 'single' : 'multi',
    amountOutRaw,
    amountOut: formatUnits(amountOutRaw, tokenOut.decimals),
    symbols: best.tokens.map((t) => t.symbol),
    fees: best.fees,
    pools: best.pools,
    path: best.protocol === 'v3'
      ? (isSingleV3 ? null : encodeV3Path(best))
      : best.tokens.map((t) => t.address),
    priceImpactPct,
    poolFeePct,
  };
}

// ── Execution ────────────────────────────────────────────────────────────
async function approveIfNeeded(tokenAddress, account, amount, spender) {
  const publicClient = getPublicClient();
  const allowance = await publicClient.readContract({
    address: tokenAddress, abi: ERC20_ABI, functionName: 'allowance', args: [account, spender],
  });
  if (allowance >= amount) return null;

  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account, chain: arcMainnetChain, address: tokenAddress, abi: ERC20_ABI, functionName: 'approve',
    args: [spender, amount],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Approval failed.');
  return hash;
}

/**
 * amountInRaw is the GROSS amount the user pays (fee included).
 * minAmountOutRaw already has slippage applied.
 */
export async function executeUniSwap({ account, tokenIn, tokenOut, amountInRaw, minAmountOutRaw, route, onStatus }) {
  if (!MAINNET_READY) throw new Error('Mainnet swaps are not configured yet.');
  if (!route) throw new Error('No route available.');

  await ensureArcMainnet();
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();

  onStatus?.('Checking approval…');
  await approveIfNeeded(tokenIn.address, account, amountInRaw, ARROW_FEE_ROUTER);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

  let request;
  if (route.protocol === 'v2') {
    request = {
      address: ARROW_FEE_ROUTER, abi: FEE_ROUTER_ABI, functionName: 'swapV2',
      args: [route.path, amountInRaw, minAmountOutRaw, deadline],
    };
  } else if (route.kind === 'single') {
    request = {
      address: ARROW_FEE_ROUTER, abi: FEE_ROUTER_ABI, functionName: 'swapV3Single',
      args: [tokenIn.address, tokenOut.address, route.fees[0], amountInRaw, minAmountOutRaw, deadline],
    };
  } else {
    request = {
      address: ARROW_FEE_ROUTER, abi: FEE_ROUTER_ABI, functionName: 'swapV3Path',
      args: [route.path, amountInRaw, minAmountOutRaw, deadline],
    };
  }

  // Dry-run first so a slippage / liquidity failure shows a clear error
  // instead of a wallet "gas estimation failed" popup.
  onStatus?.('Simulating swap…');
  await publicClient.simulateContract({ account, ...request });

  onStatus?.('Swapping…');
  const hash = await walletClient.writeContract({ account, chain: arcMainnetChain, ...request });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Swap reverted onchain.');
  return hash;
}