/**
 * Arc Mainnet — Uniswap v4 pool config.
 *
 * Chain ID 5042. All contract addresses below are the ones you confirmed as
 * official. Two things are NOT filled in and MUST be confirmed before this
 * goes live:
 *
 *   1. `fee` / `tickSpacing` / `hooks` for each pool — a v4 pool is uniquely
 *      identified by (currency0, currency1, fee, tickSpacing, hooks). If any
 *      of these are wrong, reads/writes will simply hit an uninitialized
 *      pool (getSlot0 reverts / addLiquidity reverts) — it won't silently
 *      write to the wrong pool, but nothing will work until they're right.
 *      Pull the real values from whatever created the pool (Arc explorer's
 *      "Initialize" event on PoolManager, or wherever you deployed/seeded
 *      these pools).
 *
 * Everything else here (token addresses, decimals, v4 contract addresses)
 * is exactly what you gave me.
 */

export const MAINNET_CHAIN_ID = 5042;

export const MAINNET_TOKENS_V4 = {
  USDC: {
    address: '0x3600000000000000000000000000000000000000',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  EURC: {
    address: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
  },
  cirBTC: {
    address: '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0',
    symbol: 'cirBTC',
    name: 'Circle Wrapped BTC',
    decimals: 8,
  },
};

// Official Uniswap v4 deployment on Arc Mainnet, as you confirmed.
export const UNIV4_CONTRACTS = {
  poolManager: '0x8366a39CC670B4001A1121B8F6A443A643e40951',
  positionDescriptor: '0x516b8a945700D6bBfDeDaa6dcFc4586bA60B8707',
  positionManager: '0x6049c9a0e26405C0985f9E3685C87d0aE917f82B',
  quoter: '0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94',
  stateView: '0xF3334192D15450CdD385c8B70e03f9A6bD9E673b',
  reservesLens: '0x0000001b173C3bbF3984D417d8614E3eed34865B',
  universalRouter: '0x4fcA4a51Ab4F23A7447b3284fBd7D73289A89Fb1',
  universalRouter2: '0x8702463e73f74d0b6765aBceb314Ef07aCb92650',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
};

// currency0 must be numerically < currency1 in v4 — confirmed:
//   cirBTC (0x171...) < USDC (0x360...) < EURC (0xbEf...)
export const MAINNET_POOLS_V4 = [
  {
    key: 'cirbtcUsdc',
    label: 'cirBTC / USDC',
    currency0: MAINNET_TOKENS_V4.cirBTC,
    currency1: MAINNET_TOKENS_V4.USDC,
    // TODO confirm against the real deployed pool before use
    fee: 3000,
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000',
  },
  {
    key: 'usdcEurc',
    label: 'USDC / EURC',
    currency0: MAINNET_TOKENS_V4.USDC,
    currency1: MAINNET_TOKENS_V4.EURC,
    // TODO confirm against the real deployed pool before use
    fee: 3000,
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000',
  },
  {
    key: 'cirbtcEurc',
    label: 'cirBTC / EURC',
    currency0: MAINNET_TOKENS_V4.cirBTC,
    currency1: MAINNET_TOKENS_V4.EURC,
    // TODO confirm against the real deployed pool before use — this pool
    // must actually exist / be initialized on Arc Mainnet or every read
    // and write against it will fail.
    fee: 3000,
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000',
  },
];

/**
 * ── Platform (treasury) fee on Add Liquidity ─────────────────────────────
 *
 * IMPORTANT — read this before relying on it:
 * This fee is enforced ONLY by this frontend. On every Add Liquidity call,
 * the app takes LIQUIDITY_FEE_BPS (basis points) of each deposited token
 * and sends it directly to TREASURY_ADDRESS as a plain ERC-20 transfer,
 * then deposits the remainder as liquidity.
 *
 * This is NOT a protocol-level fee. It is not enforced by the Uniswap v4
 * pool contracts themselves — anyone who calls PositionManager directly
 * (bypassing your UI) can add liquidity without paying it. A truly
 * on-chain-enforced fee requires writing and deploying a custom v4 hook
 * with a beforeAddLiquidity/afterAddLiquidity callback, which also means
 * deploying new pools (pool identity includes the hooks address).
 */
export const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '';

// 5 basis points = 0.05%
export const LIQUIDITY_FEE_BPS = 5;

export function isValidTreasuryAddress(addr) {
  return (
    typeof addr === 'string' &&
    /^0x[a-fA-F0-9]{40}$/.test(addr) &&
    addr.toLowerCase() !== '0x0000000000000000000000000000000000000000'
  );
}

// StateView is a read-only lens over PoolManager's internal storage —
// this is the minimal ABI slice we need.
export const STATE_VIEW_ABI = [
  {
    type: 'function', name: 'getSlot0', stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
  },
  {
    type: 'function', name: 'getLiquidity', stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
];

export const ERC20_ABI_V4 = [
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function', name: 'transfer', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
];