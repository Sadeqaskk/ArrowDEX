import { POOL_CONFIG } from './poolConfig';
import { VAULT_CONFIG } from './vaultConfig';

/**
 * Real event definitions matching the Solidity events emitted by each
 * deployed contract. Used with viem's getContractEvents to scan on-chain
 * logs directly — no explorer API key required, since these are your own
 * contracts and you already know every event they emit.
 */

const POOL_EVENTS = [
  {
    type: 'event', name: 'LiquidityAdded',
    inputs: [
      { indexed: true, name: 'provider', type: 'address' },
      { indexed: false, name: 'amountA', type: 'uint256' },
      { indexed: false, name: 'amountB', type: 'uint256' },
      { indexed: false, name: 'lpMinted', type: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'LiquidityRemoved',
    inputs: [
      { indexed: true, name: 'provider', type: 'address' },
      { indexed: false, name: 'amountA', type: 'uint256' },
      { indexed: false, name: 'amountB', type: 'uint256' },
      { indexed: false, name: 'lpBurned', type: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'Swap',
    inputs: [
      { indexed: true, name: 'trader', type: 'address' },
      { indexed: false, name: 'tokenIn', type: 'address' },
      { indexed: false, name: 'amountIn', type: 'uint256' },
      { indexed: false, name: 'tokenOut', type: 'address' },
      { indexed: false, name: 'amountOut', type: 'uint256' },
    ],
  },
];

const VAULT_EVENTS = [
  {
    type: 'event', name: 'Staked',
    inputs: [{ indexed: true, name: 'user', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }],
  },
  {
    type: 'event', name: 'Withdrawn',
    inputs: [{ indexed: true, name: 'user', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }],
  },
  {
    type: 'event', name: 'RewardPaid',
    inputs: [{ indexed: true, name: 'user', type: 'address' }, { indexed: false, name: 'reward', type: 'uint256' }],
  },
];

const WUSDC_EVENTS = [
  {
    type: 'event', name: 'Deposit',
    inputs: [{ indexed: true, name: 'account', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }],
  },
  {
    type: 'event', name: 'Withdrawal',
    inputs: [{ indexed: true, name: 'account', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }],
  },
];

export const ACTIVITY_SOURCES = [
  { address: POOL_CONFIG.pool.address, events: POOL_EVENTS, label: 'Pool' },
  { address: VAULT_CONFIG.vault.address, events: VAULT_EVENTS, label: 'Vault' },
  { address: POOL_CONFIG.wusdc.address, events: WUSDC_EVENTS, label: 'WUSDC' },
];