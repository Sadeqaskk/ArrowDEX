/**
 * Real deployed ArrowVault staking contract on Arc Testnet.
 * Stake ARROW-LP (from the WUSDC/ARROW pool), earn ARROW rewards.
 */

export const VAULT_CONFIG = {
  chainKey: 'arcTestnet',
  vault: {
    address: '0x23B595fcFD75F8fD46FC044220b74a93cdFDd7F9',
    name: 'Arrow Vault: ARROW-LP Staking',
  },
  stakingToken: {
    address: '0x92318C8845283B9E8A33124Ef4EC520491F826F0', // ArrowPool LP token
    symbol: 'ARROW-LP',
    decimals: 18,
  },
  rewardToken: {
    address: '0xf49963fF85418060dD7F8310FEEf3Ce6E37e2561', // ARROW
    symbol: 'ARROW',
    decimals: 18,
  },
};

export const ARROW_VAULT_ABI = [
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'earned', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'rewardRate', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'periodFinish', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'stake', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'getReward', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'exit', stateMutability: 'nonpayable', inputs: [], outputs: [] },
];