export const AMM_TOKEN_GETTERS_ABI = [
  { type: 'function', name: 'tokenA', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'tokenB', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const;

export const ERC20_DECIMALS_ABI = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

// ArrowVault wraps a separate staking token rather than being one itself —
// confirm this function name against your actual contract; rename here if different.
export const VAULT_TOKEN_GETTER_ABI = [
  { type: 'function', name: 'stakingToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const;

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
] as const;

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
] as const;

export const VAULT_ABI = [
  { type: 'event', name: 'Staked', inputs: [
    { indexed: true, name: 'user', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
  ]},
  { type: 'event', name: 'Withdrawn', inputs: [
    { indexed: true, name: 'user', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
  ]},
] as const;

// Circle TokenMessengerV2's DepositForBurn — confirmed to match the deployed contract
// (includes maxFee/minFinalityThreshold/hookData; V1's shape does not have these and
// indexes burnToken + nonce instead — don't swap this back to V1's signature).
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
] as const;