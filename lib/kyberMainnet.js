/**
 * ArrowDEX — Arc MAINNET swap support (USDC / EURC / cirBTC) via KyberSwap's
 * aggregator, so a single quote already compares Aero, Uniswap, and every other
 * DEX KyberSwap indexes on Arc — the same thing Tower Exchange does.
 *
 * This file is additive. It does not touch lib/swap.js or lib/swapConfig.js, so
 * everything on Arc Testnet keeps working exactly as before. It exports the same
 * names as the earlier lib/uniMainnet.js, so app/swap/page.js only needed its two
 * import lines repointed here — nothing else in the page changed.
 *
 * Flow on mainnet:
 *   quote  ->  KyberSwap `GET /arc/api/v1/routes`, on the amount left AFTER the
 *              ArrowDEX fee
 *   swap   ->  KyberSwap `POST /arc/api/v1/route/build` (built with sender =
 *              recipient = our fee router, so output lands there first), then
 *              ArrowKyberFeeRouter.swap(...) forwards that exact calldata,
 *              verifies the output balance itself, and sends it to the user.
 *
 * ── DEPLOYMENT ───────────────────────────────────────────────────────────
 *   ARROW_FEE_ROUTER is the deployed ArrowKyberFeeRouter on Arc Mainnet.
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
} from 'viem';
import { getActiveProvider } from './activeProvider';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ── Your fee router ──────────────────────────────────────────────────────
export const ARROW_FEE_ROUTER = '0x6942ce32f4e9a3083887f1e3112847c55d55E7B3';

// ── KyberSwap aggregator on Arc ───────────────────────────────────────────
// Verified against KyberSwap's own address list, which is shared across every
// chain they support: docs.kyberswap.com/developer-guide/aggregator-api/contracts
export const KYBER_ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5';
const KYBER_CHAIN_SLUG = 'arc';
const KYBER_API_BASE = `https://aggregator-api.kyberswap.com/${KYBER_CHAIN_SLUG}/api/v1`;
// KyberSwap asks integrators to send a client ID to avoid rate limiting.
// Swap this for your own once you have one — see docs.kyberswap.com for how to get one.
const KYBER_CLIENT_ID = 'ArrowDEX';

// Multicall3 on Arc Mainnet (docs.arc.io contract addresses).
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

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

const FEE_ROUTER_ABI = [
  { type: 'function', name: 'feeBps', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function', name: 'swap', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'swapCalldata', type: 'bytes' },
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

// Must mirror ArrowKyberFeeRouter._collect exactly (floor division).
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

// ── KyberSwap API ────────────────────────────────────────────────────────
async function kyberFetch(path, options) {
  const res = await fetch(`${KYBER_API_BASE}${path}`, {
    ...options,
    headers: { 'X-Client-Id': KYBER_CLIENT_ID, ...(options?.headers || {}) },
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`KyberSwap returned an unreadable response (HTTP ${res.status}).`);
  }
  if (!res.ok || !json?.data) {
    throw new Error(json?.message || `KyberSwap request failed (HTTP ${res.status}).`);
  }
  return json.data;
}

/**
 * Best route across every DEX KyberSwap indexes on Arc, for `amountInRaw`
 * (already net of the ArrowDEX fee). Returns null when no route exists.
 * The returned object's `routeSummary` must be passed back verbatim to
 * executeUniSwap — KyberSwap requires it unmodified for the build step.
 */
export async function getUniQuote({ tokenIn, tokenOut, amountInRaw }) {
  if (!amountInRaw || amountInRaw <= 0n) return null;

  const params = new URLSearchParams({
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn: amountInRaw.toString(),
  });

  let data;
  try {
    data = await kyberFetch(`/routes?${params.toString()}`);
  } catch (err) {
    // "No route" surfaces as a non-2xx from KyberSwap for some pairs/sizes —
    // treat that the same as "no route" rather than a hard error.
    if (/no route|not found/i.test(err.message)) return null;
    throw err;
  }

  const { routeSummary, routerAddress } = data;
  if (!routeSummary || !(BigInt(routeSummary.amountOut) > 0n)) return null;

  if (routerAddress && routerAddress.toLowerCase() !== KYBER_ROUTER.toLowerCase()) {
    // KyberSwap's own docs say this address is fixed per chain; if it ever
    // reports a different one, refuse rather than build calldata for a
    // router our deployed fee contract doesn't call.
    throw new Error("KyberSwap returned an unexpected router address for this quote.");
  }

  const amountOutRaw = BigInt(routeSummary.amountOut);
  return {
    kind: 'aggregated',
    amountOutRaw,
    amountOut: formatUnits(amountOutRaw, tokenOut.decimals),
    symbols: [tokenIn.symbol, tokenOut.symbol],
    // Not a single fixed number for an aggregator — it may split across
    // several venues, each with its own fee. Shown as "—" in the UI.
    poolFeePct: null,
    priceImpactPct: null,
    routeSummary,
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
 * minAmountOutRaw already has slippage applied, against route.amountOutRaw.
 */
export async function executeUniSwap({ account, tokenIn, tokenOut, amountInRaw, minAmountOutRaw, route, onStatus }) {
  if (!MAINNET_READY) throw new Error('Mainnet swaps are not configured yet.');
  if (!route?.routeSummary) throw new Error('No route available.');

  await ensureArcMainnet();
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();

  onStatus?.('Checking approval…');
  await approveIfNeeded(tokenIn.address, account, amountInRaw, ARROW_FEE_ROUTER);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

  // slippageTolerance is in bps, derived from what the page already computed
  // rather than re-deriving effectiveSlippage here.
  const slippageBps = route.amountOutRaw > 0n
    ? Math.max(0, Number(10000n - (minAmountOutRaw * 10000n) / route.amountOutRaw))
    : 50;

  onStatus?.('Building route…');
  // sender = recipient = our fee router: output lands on the contract first,
  // so its own balance check (not this quote) is what guarantees delivery.
  const build = await kyberFetch('/route/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routeSummary: route.routeSummary,
      sender: ARROW_FEE_ROUTER,
      recipient: ARROW_FEE_ROUTER,
      slippageTolerance: slippageBps,
      deadline: Number(deadline),
    }),
  });

  if (!build?.data) throw new Error('KyberSwap did not return swap calldata for this route.');
  if (build.routerAddress && build.routerAddress.toLowerCase() !== KYBER_ROUTER.toLowerCase()) {
    throw new Error('KyberSwap returned an unexpected router address for this build.');
  }

  const request = {
    address: ARROW_FEE_ROUTER, abi: FEE_ROUTER_ABI, functionName: 'swap',
    args: [tokenIn.address, tokenOut.address, amountInRaw, minAmountOutRaw, build.data, deadline],
  };

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