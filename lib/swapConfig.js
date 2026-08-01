/**
 * ArrowSwap pools config — Arc Testnet.
 *
 * IMPORTANT: this project has two DIFFERENT pool contracts, not one:
 *
 *  - USDC/EURC  -> the original ArrowSwap contract. Write function is
 *                  `swap(tokenIn, amountIn, minAmountOut)`.
 *  - WUSDC/ARROW -> the newer ArrowPool contract. Write functions are
 *                  `swapAForB(amountAIn, amountBOutMin)` /
 *                  `swapBForA(amountBIn, amountAOutMin)`.
 *
 * They share the same *read* surface (tokenA/tokenB/getReserves/
 * getAmountOut), so we keep one view-only ABI for reads and two
 * separate ABIs for the write call each contract actually supports.
 * `pool.type` ('swap' | 'pool') tells swap.js which write ABI/path to use.
 *
 * Addresses confirmed from Arc's own docs and testnet tooling
 * (https://docs.arc.io/arc/references/contract-addresses).
 */

export const SWAP_ADDRESS = '0x847ee9aA98A05d371Be291A95A087FA02E77A416';
export const ARROW_POOL_ADDRESS = '0x92318C8845283B9E8A33124Ef4EC520491F826F0';

export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
export const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
export const WUSDC_ADDRESS = '0x6eE5a47Ae9F0536675041ed900fD3Ef1AA1Dea18';
export const ARROW_ADDRESS = '0xf49963fF85418060dD7F8310FEEf3Ce6E37e2561';

export const TOKENS = [
  { symbol: 'USDC', name: 'USD Coin', address: USDC_ADDRESS, decimals: 6, color: 'from-[#8B7FFF] to-laser', logo: '/fonts/tokens/usdc.png', disabled: false },
  { symbol: 'EURC', name: 'Euro Coin', address: EURC_ADDRESS, decimals: 6, color: 'from-success to-[#2f9e7c]', logo: '/fonts/tokens/eurc.png', disabled: false },
  { symbol: 'WUSDC', name: 'Wrapped USDC', address: WUSDC_ADDRESS, decimals: 18, color: 'from-[#4D8AFF] to-[#2f5fc9]', logo: '/fonts/tokens/wusdc.png', disabled: false },
  { symbol: 'ARROW', name: 'Arrow Token', address: ARROW_ADDRESS, decimals: 18, color: 'from-[#8B7FFF] to-[#4d3fc9]', logo: '/fonts/tokens/arrow.png', disabled: false },
  { symbol: 'cirBTC', name: 'Circle Bitcoin (coming soon)', address: null, decimals: 8, color: 'from-danger to-[#b23f5c]', logo: '/fonts/tokens/cirbtc.png', disabled: true },
];

// Every deployed pool. tokenA/tokenB are our own declared ordering (not
// necessarily the on-chain constructor order — swap.js resolves that by
// address at read/write time). `type` selects which contract interface
// (and therefore which ABI + write function) applies to this pool.
export const POOLS = [
  { key: 'usdcEurc', type: 'swap', address: SWAP_ADDRESS, tokenA: 'USDC', tokenB: 'EURC' },
  { key: 'wusdcArrow', type: 'pool', address: ARROW_POOL_ADDRESS, tokenA: 'WUSDC', tokenB: 'ARROW' },
];

export function getTokenBySymbol(symbol) {
  return TOKENS.find((t) => t.symbol === symbol) || null;
}

// Finds the (single) pool that trades the two given symbols directly, in
// either order. Returns null if there's no direct pool for that pair —
// callers should treat that as "not tradeable yet" rather than guessing a route.
export function findPool(symbolA, symbolB) {
  return (
    POOLS.find(
      (p) =>
        (p.tokenA === symbolA && p.tokenB === symbolB) ||
        (p.tokenA === symbolB && p.tokenB === symbolA)
    ) || null
  );
}

export const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
];

// Shared READ surface — both ArrowSwap and ArrowPool implement these
// identically, so getPoolState/quoteSwap can use this one ABI for any pool
// regardless of `type`. Do NOT add write functions here.
export const POOL_VIEW_ABI = [
  { type: 'function', name: 'tokenA', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'tokenB', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'getReserves', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }, { name: '', type: 'uint256' }] },
  { type: 'function', name: 'getAmountOut', stateMutability: 'pure', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'reserveIn', type: 'uint256' }, { name: 'reserveOut', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
];

// ArrowSwap.sol — USDC/EURC pool. Single generic swap() entrypoint.
export const ARROWSWAP_ABI = [
  ...POOL_VIEW_ABI,
  {
    type: 'function', name: 'swap', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
];

// ArrowPool.sol — WUSDC/ARROW pool (and any future pools deployed from the
// same contract). Directional swapAForB/swapBForA, no generic swap().
export const ARROWPOOL_ABI = [
  ...POOL_VIEW_ABI,
  {
    type: 'function', name: 'swapAForB', stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountAIn', type: 'uint256' },
      { name: 'amountBOutMin', type: 'uint256' },
    ],
    outputs: [{ name: 'amountBOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'swapBForA', stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountBIn', type: 'uint256' },
      { name: 'amountAOutMin', type: 'uint256' },
    ],
    outputs: [{ name: 'amountAOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'addLiquidity', stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountADesired', type: 'uint256' },
      { name: 'amountBDesired', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'removeLiquidity', stateMutability: 'nonpayable',
    inputs: [
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
    ],
    outputs: [{ name: 'amountA', type: 'uint256' }, { name: 'amountB', type: 'uint256' }],
  },
];

// Convenience lookup so callers don't have to if/else on pool.type themselves.
export const POOL_ABIS = {
  swap: ARROWSWAP_ABI,
  pool: ARROWPOOL_ABI,
};

export function getPoolAbi(pool) {
  const abi = POOL_ABIS[pool.type];
  if (!abi) throw new Error(`Unknown pool type "${pool.type}" for pool ${pool.key}`);
  return abi;
}