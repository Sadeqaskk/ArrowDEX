/**
 * ArrowFaucet config.
 *
 * TODO: after deploying ArrowFaucet.sol (see that file's header comment for
 * deploy steps) and funding it with ARROW, paste the deployed contract
 * address below. Until you do, FAUCET_ADDRESS is null and the faucet UI
 * will show a "not configured yet" state instead of erroring.
 */

export const FAUCET_ADDRESS = '0x855B31D1BFdeAcA1C51C329B8EeA6006ae97bea3';

export const ARROW_FAUCET_ABI = [
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimAmount', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'cooldown', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'faucetBalance', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'timeUntilNextClaim', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
];