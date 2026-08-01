/**
 * Real deployed Arrow DEX pool contracts on Arc Testnet.
 * Addresses confirmed by the user after deployment via Remix.
 */

export const POOL_CONFIG = {
  chainKey: 'arcTestnet',
  wusdc: {
    address: '0x6eE5a47Ae9F0536675041ed900fD3Ef1AA1Dea18',
    symbol: 'WUSDC',
    name: 'Wrapped USDC',
    decimals: 18,
  },
  arrow: {
    address: '0xf49963fF85418060dD7F8310FEEf3Ce6E37e2561',
    symbol: 'ARROW',
    name: 'Arrow Test Token',
    decimals: 18,
  },
  pool: {
    address: '0x92318C8845283B9E8A33124Ef4EC520491F826F0',
    symbol: 'ARROW-LP',
    name: 'Arrow LP: WUSDC/ARROW',
  },
};

export const ERC20_ABI = [
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
    type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [],
  },
];

export const ARROW_POOL_ABI = [
  {
    type: 'function', name: 'getReserves', stateMutability: 'view', inputs: [],
    outputs: [{ name: '', type: 'uint256' }, { name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'getAmountOut', stateMutability: 'pure',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'reserveIn', type: 'uint256' },
      { name: 'reserveOut', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
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
  {
    type: 'function', name: 'swapAForB', stateMutability: 'nonpayable',
    inputs: [{ name: 'amountAIn', type: 'uint256' }, { name: 'amountBOutMin', type: 'uint256' }],
    outputs: [{ name: 'amountBOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'swapBForA', stateMutability: 'nonpayable',
    inputs: [{ name: 'amountBIn', type: 'uint256' }, { name: 'amountAOutMin', type: 'uint256' }],
    outputs: [{ name: 'amountAOut', type: 'uint256' }],
  },
];
