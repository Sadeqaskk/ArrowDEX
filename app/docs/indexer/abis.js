export const POOL_ABI = [
  { type: 'event', name: 'LiquidityAdded', inputs: [
    { indexed: true, name: 'provider', type: 'address' },
    { indexed: false, name: 'amountA', type: 'uint256' },
    { indexed: false, name: 'amountB', type: 'uint256' },
    { indexed: false, name: 'lpMinted', type: 'uint256' },
  ]},
  { type: 'event', name: 'LiquidityRemoved', inputs: [
    { indexed: true, name: 'provider', type: 'address' },
    { indexed: false, name: 'amountA', type: 'uint256' },
    { indexed: false, name: 'amountB', type: 'uint256' },
    { indexed: false, name: 'lpBurned', type: 'uint256' },
  ]},
  { type: 'event', name: 'Swap', inputs: [
    { indexed: true, name: 'trader', type: 'address' },
    { indexed: false, name: 'tokenIn', type: 'address' },
    { indexed: false, name: 'amountIn', type: 'uint256' },
    { indexed: false, name: 'tokenOut', type: 'address' },
    { indexed: false, name: 'amountOut', type: 'uint256' },
  ]},
];

export const SWAP_ABI = [
  { type: 'event', name: 'LiquidityAdded', inputs: [
    { indexed: true, name: 'provider', type: 'address' },
    { indexed: false, name: 'amountA', type: 'uint256' },
    { indexed: false, name: 'amountB', type: 'uint256' },
    { indexed: false, name: 'liquidity', type: 'uint256' },
  ]},
  { type: 'event', name: 'LiquidityRemoved', inputs: [
    { indexed: true, name: 'provider', type: 'address' },
    { indexed: false, name: 'amountA', type: 'uint256' },
    { indexed: false, name: 'amountB', type: 'uint256' },
    { indexed: false, name: 'liquidity', type: 'uint256' },
  ]},
  { type: 'event', name: 'Swap', inputs: [
    { indexed: true, name: 'trader', type: 'address' },
    { indexed: true, name: 'tokenIn', type: 'address' },
    { indexed: false, name: 'amountIn', type: 'uint256' },
    { indexed: false, name: 'amountOut', type: 'uint256' },
  ]},
];

export const VAULT_ABI = [
  { type: 'event', name: 'Staked', inputs: [
    { indexed: true, name: 'user', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
  ]},
  { type: 'event', name: 'Withdrawn', inputs: [
    { indexed: true, name: 'user', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
  ]},
];

// Only the event we need from Circle's TokenMessengerV2
export const CCTP_ABI = [
  { type: 'event', name: 'DepositForBurn', inputs: [
    { indexed: false, name: 'burnToken', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: true, name: 'depositor', type: 'address' },
    { indexed: false, name: 'mintRecipient', type: 'bytes32' },
    { indexed: false, name: 'destinationDomain', type: 'uint32' },
    { indexed: false, name: 'destinationTokenMessenger', type: 'bytes32' },
    { indexed: false, name: 'destinationCaller', type: 'bytes32' },
    { indexed: false, name: 'maxFee', type: 'uint256' },
    { indexed: false, name: 'minFinalityThreshold', type: 'uint32' },
    { indexed: false, name: 'hookData', type: 'bytes' },
  ]},
];

// Read directly from each deployed pool/swap contract instead of hardcoding
// addresses — used by getPoolTokens() in index.js to derive tokenOut for
// ArrowSwap's Swap event (which has no tokenOut field) and to look up
// decimals for LiquidityAdded/Removed, which never carry token addresses.
export const AMM_TOKEN_GETTERS_ABI = [
  { type: 'function', name: 'tokenA', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'tokenB', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];