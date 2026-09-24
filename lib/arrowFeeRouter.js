// lib/arrowFeeRouter.js
// Client for ArrowDexFeeRouter (Arc mainnet). Adds full-range Uniswap v4 liquidity
// through the router so the 0.07% fee is taken on-chain in the same transaction.
//
// Assumes viem (your code reads err.shortMessage, which is viem's error shape).
// All calls go through the connected wallet's provider, so no RPC URL is needed here.

import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  parseUnits,
  decodeEventLog,
  erc20Abi,
  zeroAddress,
} from 'viem';

export const ARROW_FEE_ROUTER_ADDRESS = '0xa0238a7A66911e79E31D363f18ac3bb954862aB3';
export const ARC_MAINNET_CHAIN_ID = 5042;

const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: 'Arc Mainnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['http://localhost'] } }, // unused — the wallet provider is the transport
});

const FEE_ROUTER_ABI = [
  { type: 'function', name: 'feeBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  {
    type: 'function',
    name: 'addLiquidityWithFee',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'p',
        type: 'tuple',
        components: [
          {
            name: 'key',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'tickLower', type: 'int24' },
          { name: 'tickUpper', type: 'int24' },
          { name: 'liquidity', type: 'uint256' },
          { name: 'amount0Max', type: 'uint128' },
          { name: 'amount1Max', type: 'uint128' },
          { name: 'grossAmount0', type: 'uint256' },
          { name: 'grossAmount1', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'fee0', type: 'uint256' },
      { name: 'fee1', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'LiquidityAddedWithFee',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'currency0', type: 'address', indexed: true },
      { name: 'currency1', type: 'address', indexed: true },
      { name: 'fee0', type: 'uint256', indexed: false },
      { name: 'fee1', type: 'uint256', indexed: false },
      { name: 'tokenId', type: 'uint256', indexed: false },
    ],
  },
];

function getClients(account) {
  if (typeof window === 'undefined' || !window.ethereum) throw new Error('No wallet found.');
  const transport = custom(window.ethereum);
  return {
    publicClient: createPublicClient({ chain: arcMainnet, transport }),
    walletClient: account ? createWalletClient({ account, chain: arcMainnet, transport }) : null,
  };
}

// ── Fee ────────────────────────────────────────────────────────────────

/** Reads the live fee from the router so the UI can never drift from the contract. */
export async function readRouterFeeBps() {
  const { publicClient } = getClients();
  const v = await publicClient.readContract({
    address: ARROW_FEE_ROUTER_ADDRESS,
    abi: FEE_ROUTER_ABI,
    functionName: 'feeBps',
  });
  return Number(v);
}

/** Mirrors the contract exactly: fee = gross * feeBps / 10000 (floored), net = gross - fee. */
export function splitFee(gross, feeBps) {
  const fee = (gross * BigInt(feeBps)) / 10000n;
  return { fee, net: gross - fee };
}

// ── Amounts ────────────────────────────────────────────────────────────

/** "1.234567891" -> raw bigint, truncating (never rounding up) to the token's decimals. */
export function toUnits(value, decimals) {
  const s = String(value ?? '').trim();
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null;
  const [whole, frac = ''] = s.split('.');
  return parseUnits(`${whole || '0'}.${frac.slice(0, decimals) || '0'}`, decimals);
}

/** Used by the UI to show the fee breakdown before the user confirms. */
export function previewAdd({ poolCfg, amount0, amount1, feeBps }) {
  const gross0 = toUnits(amount0, poolCfg.currency0.decimals);
  const gross1 = toUnits(amount1, poolCfg.currency1.decimals);
  if (!gross0 || !gross1 || gross0 <= 0n || gross1 <= 0n) return null;
  const s0 = splitFee(gross0, feeBps);
  const s1 = splitFee(gross1, feeBps);
  return { gross0, gross1, fee0: s0.fee, fee1: s1.fee, net0: s0.net, net1: s1.net };
}

// ── Full-range liquidity math (Uniswap v4 / v3 formulas) ───────────────

const Q96 = 2n ** 96n;
const MIN_SQRT_RATIO = 4295128739n;
const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;
const MAX_TICK = 887272;

export function fullRangeTicks(tickSpacing) {
  return {
    tickLower: Math.ceil(-MAX_TICK / tickSpacing) * tickSpacing,
    tickUpper: Math.floor(MAX_TICK / tickSpacing) * tickSpacing,
  };
}

const ceilDiv = (a, b) => (a + b - 1n) / b;

// Amounts PositionManager will pull for liquidity L (it rounds up, so we do too).
function amountsForLiquidity(L, sqrtP) {
  const a0 = ceilDiv(L * (MAX_SQRT_RATIO - sqrtP) * Q96, MAX_SQRT_RATIO * sqrtP);
  const a1 = ceilDiv(L * (sqrtP - MIN_SQRT_RATIO), Q96);
  return [a0, a1];
}

/**
 * Largest liquidity whose required amounts fit inside net0/net1 at the current price.
 * Uses the absolute min/max sqrt ratios as the range bounds: for a ±887220 tick range the
 * difference is ~1e-19 relative, and the loop below shaves L until the rounded-up
 * amounts fit, so this can only ever under-deposit, never overshoot.
 */
export function fullRangeLiquidity(sqrtP, net0, net1) {
  if (sqrtP <= MIN_SQRT_RATIO || sqrtP >= MAX_SQRT_RATIO) return 0n;
  const L0 = (net0 * ((sqrtP * MAX_SQRT_RATIO) / Q96)) / (MAX_SQRT_RATIO - sqrtP);
  const L1 = (net1 * Q96) / (sqrtP - MIN_SQRT_RATIO);
  let L = L0 < L1 ? L0 : L1;
  for (let i = 0; i < 200 && L > 0n; i++) {
    const [a0, a1] = amountsForLiquidity(L, sqrtP);
    if (a0 <= net0 && a1 <= net1) return L;
    L -= L / 100000n + 1n;
  }
  return 0n;
}

// ── Add liquidity through the router ───────────────────────────────────

/**
 * Approves (if needed), simulates, then sends addLiquidityWithFee.
 * `sqrtPriceX96` should be read right before calling so the liquidity matches the pool.
 * Returns { hash, tokenId, liquidity, tickLower, tickUpper, fee0, fee1 }.
 */
export async function addLiquidityWithFee({
  account,
  poolCfg,
  amount0,
  amount1,
  sqrtPriceX96,
  onStatus = () => {},
}) {
  const { publicClient, walletClient } = getClients(account);

  const chainId = await publicClient.getChainId();
  if (chainId !== ARC_MAINNET_CHAIN_ID) throw new Error('Switch your wallet to Arc Mainnet, then try again.');

  // The router only handles ERC-20 pairs. A pool keyed on native USDC (zero address) can't be deposited into.
  if (
    poolCfg.currency0.isNative || poolCfg.currency1.isNative ||
    poolCfg.currency0.address === zeroAddress || poolCfg.currency1.address === zeroAddress
  ) {
    throw new Error('This pool uses native USDC, which the fee router cannot deposit yet.');
  }
  // No price means the pool key didn't match a live pool.
  if (sqrtPriceX96 === undefined || sqrtPriceX96 === null || BigInt(sqrtPriceX96) === 0n) {
    throw new Error('Pool not found or not initialized: check the pool key in lib/uniV4PoolConfig.js.');
  }

  const feeBps = await readRouterFeeBps();
  const p = previewAdd({ poolCfg, amount0, amount1, feeBps });
  if (!p) throw new Error('Enter an amount for both tokens.');

  const liquidity = fullRangeLiquidity(BigInt(sqrtPriceX96), p.net0, p.net1);
  if (liquidity <= 0n) throw new Error('Amounts are too small for this pool.');
  const { tickLower, tickUpper } = fullRangeTicks(poolCfg.tickSpacing);

  // Approve the router for the GROSS amounts (it pulls gross, skims the fee, deposits the net).
  for (const [token, gross, symbol] of [
    [poolCfg.currency0.address, p.gross0, poolCfg.currency0.symbol],
    [poolCfg.currency1.address, p.gross1, poolCfg.currency1.symbol],
  ]) {
    const allowance = await publicClient.readContract({
      address: token, abi: erc20Abi, functionName: 'allowance', args: [account, ARROW_FEE_ROUTER_ADDRESS],
    });
    if (allowance < gross) {
      onStatus(`Approve ${symbol} in your wallet…`);
      const h = await walletClient.writeContract({
        address: token, abi: erc20Abi, functionName: 'approve', args: [ARROW_FEE_ROUTER_ADDRESS, gross],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
    }
  }

  const params = {
    key: {
      currency0: poolCfg.currency0.address,
      currency1: poolCfg.currency1.address,
      fee: poolCfg.fee,
      tickSpacing: poolCfg.tickSpacing,
      hooks: poolCfg.hooks || zeroAddress,
    },
    tickLower,
    tickUpper,
    liquidity,
    amount0Max: p.net0, // the router pulls at most what is left after the fee
    amount1Max: p.net1,
    grossAmount0: p.gross0,
    grossAmount1: p.gross1,
    recipient: account, // the position NFT goes straight to the user
    deadline: BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
  };

  // Simulate first: the router is unaudited, so surface a revert reason instead of burning gas.
  onStatus('Checking transaction…');
  const { request } = await publicClient.simulateContract({
    account,
    address: ARROW_FEE_ROUTER_ADDRESS,
    abi: FEE_ROUTER_ABI,
    functionName: 'addLiquidityWithFee',
    args: [params],
  });

  onStatus('Confirm in your wallet…');
  const hash = await walletClient.writeContract(request);

  onStatus('Waiting for confirmation…');
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Transaction reverted on-chain.');

  let tokenId = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ARROW_FEE_ROUTER_ADDRESS.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: FEE_ROUTER_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === 'LiquidityAddedWithFee') tokenId = ev.args.tokenId;
    } catch { /* not our event */ }
  }

  return { hash, tokenId, liquidity, tickLower, tickUpper, fee0: p.fee0, fee1: p.fee1 };
}