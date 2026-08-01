import { createPublicClient, createWalletClient, custom, http, encodeFunctionData, formatUnits, parseUnits } from 'viem';
import { CHAINS } from './chains';

/**
 * Real deployed contracts on Arc Testnet, per user-provided addresses:
 * - WrappedUSDC (WUSDC): wraps Arc's native USDC into an ERC-20, 1:1
 * - ArrowToken (ARROW): simple testnet ERC-20, 18 decimals
 * - ArrowPool: constant-product AMM pool for WUSDC/ARROW
 *
 * ABIs below match exactly what was deployed (see the Solidity source
 * shared during the build — ArrowPool.sol, WrappedUSDC.sol, ArrowToken.sol).
 */

export const WUSDC_ADDRESS = '0x6eE5a47Ae9F0536675041ed900fD3Ef1AA1Dea18';
export const ARROW_ADDRESS = '0xf49963fF85418060dD7F8310FEEf3Ce6E37e2561';
export const POOL_ADDRESS = '0xF2908d814EA941CcE9037CB6BC2223Ee2d6bE9A7';

// Arc Testnet's officially deployed Multicall3 contract (same address as most
// EVM chains). Lets us batch every read below into a single RPC call instead
// of one call per value — this is what was tripping the rate limit.
// https://docs.arc.io/arc/references/contract-addresses
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

export const ARC = CHAINS.arcTestnet;

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [] },
];

const POOL_ABI = [
  { type: 'function', name: 'getReserves', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }, { name: '', type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function', name: 'addLiquidity', stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountADesired', type: 'uint256' },
      { name: 'amountBDesired', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
    ],
    outputs: [{ name: 'amountA', type: 'uint256' }, { name: 'amountB', type: 'uint256' }, { name: 'liquidity', type: 'uint256' }],
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
  { type: 'function', name: 'getAmountOut', stateMutability: 'pure', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'reserveIn', type: 'uint256' }, { name: 'reserveOut', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
];

// A single shared client, reused across every call, instead of creating a
// brand-new client (and TCP/RPC setup) on every single read.
let _publicClient = null;
function publicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({ transport: http(ARC.rpcUrl) });
  }
  return _publicClient;
}

function walletClient() {
  if (typeof window === 'undefined' || !window.ethereum) throw new Error('No injected wallet found.');
  return createWalletClient({ transport: custom(window.ethereum) });
}

/**
 * Everything the Pools page needs, fetched in ONE batched RPC call via
 * Multicall3 instead of ~5-7 separate eth_call requests. This is the main
 * fix for the RPC rate-limit errors — one refresh now costs one request.
 */
export async function getPoolState(address) {
  const client = publicClient();

  const hasAddress = !!address;
  const zero = '0x0000000000000000000000000000000000000000';
  const account = hasAddress ? address : zero;

  const results = await client.multicall({
    multicallAddress: MULTICALL3_ADDRESS,
    contracts: [
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: 'getReserves' },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: 'totalSupply' },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: 'balanceOf', args: [account] },
      { address: WUSDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] },
      { address: ARROW_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] },
    ],
  });

  const [reservesResult, totalSupplyResult, lpBalanceResult, wusdcBalanceResult, arrowBalanceResult] = results;

  if (reservesResult.status !== 'success') {
    throw new Error(reservesResult.error?.message || 'Failed to read pool reserves.');
  }

  const [reserveA, reserveB] = reservesResult.result;

  return {
    reserveWusdc: formatUnits(reserveA, 18),
    reserveArrow: formatUnits(reserveB, 18),
    totalSupply: totalSupplyResult.status === 'success' ? formatUnits(totalSupplyResult.result, 18) : '0',
    lpBalance: hasAddress && lpBalanceResult.status === 'success' ? formatUnits(lpBalanceResult.result, 18) : '0',
    wusdcBalance: hasAddress && wusdcBalanceResult.status === 'success' ? formatUnits(wusdcBalanceResult.result, 18) : '0',
    arrowBalance: hasAddress && arrowBalanceResult.status === 'success' ? formatUnits(arrowBalanceResult.result, 18) : '0',
  };
}

/** Real read: current pool reserves, formatted as decimal strings (18 decimals both sides). */
export async function getPoolReserves() {
  const client = publicClient();
  const [reserveA, reserveB] = await client.readContract({
    address: POOL_ADDRESS, abi: POOL_ABI, functionName: 'getReserves',
  });
  return {
    wusdc: formatUnits(reserveA, 18),
    arrow: formatUnits(reserveB, 18),
  };
}

/** Real read: this wallet's LP token balance and the pool's total LP supply. */
export async function getLpPosition(address) {
  const client = publicClient();
  const [lpBalance, totalSupply] = await Promise.all([
    client.readContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: 'balanceOf', args: [address] }),
    client.readContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: 'totalSupply' }),
  ]);
  return {
    lpBalance: formatUnits(lpBalance, 18),
    totalSupply: formatUnits(totalSupply, 18),
    sharePct: totalSupply > 0n ? (Number(lpBalance) / Number(totalSupply)) * 100 : 0,
  };
}

/** Real read: this wallet's WUSDC and ARROW token balances. */
export async function getTokenBalances(address) {
  const client = publicClient();
  const [wusdc, arrow] = await Promise.all([
    client.readContract({ address: WUSDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
    client.readContract({ address: ARROW_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
  ]);
  return { wusdc: formatUnits(wusdc, 18), arrow: formatUnits(arrow, 18) };
}

/** Real read: how much of the pool this wallet has approved the pool to spend, for each token. */
export async function getAllowances(address) {
  const client = publicClient();
  const [wusdcAllowance, arrowAllowance] = await Promise.all([
    client.readContract({ address: WUSDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, POOL_ADDRESS] }),
    client.readContract({ address: ARROW_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, POOL_ADDRESS] }),
  ]);
  return { wusdc: wusdcAllowance, arrow: arrowAllowance };
}

/** Real write: wrap native USDC into WUSDC by calling deposit() with value attached. */
export async function wrapUsdc(account, amountDecimalString) {
  const wallet = walletClient();
  const value = parseUnits(amountDecimalString, 18);
  return wallet.sendTransaction({
    account,
    to: WUSDC_ADDRESS,
    value,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'deposit', args: [] }),
  });
}

/** Real write: approve the pool to spend a token on this wallet's behalf. */
export async function approveToken(account, tokenAddress, amountDecimalString) {
  const wallet = walletClient();
  const amount = parseUnits(amountDecimalString, 18);
  return wallet.sendTransaction({
    account,
    to: tokenAddress,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [POOL_ADDRESS, amount] }),
  });
}

/** Real write: add liquidity to the pool. Amounts are decimal strings (e.g. "10.5"). */
export async function addLiquidity(account, amountWusdc, amountArrow, slippagePct = 1) {
  const wallet = walletClient();
  const amountADesired = parseUnits(amountWusdc, 18);
  const amountBDesired = parseUnits(amountArrow, 18);
  const amountAMin = (amountADesired * BigInt(Math.round((100 - slippagePct) * 100))) / 10000n;
  const amountBMin = (amountBDesired * BigInt(Math.round((100 - slippagePct) * 100))) / 10000n;

  return wallet.sendTransaction({
    account,
    to: POOL_ADDRESS,
    data: encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'addLiquidity',
      args: [amountADesired, amountBDesired, amountAMin, amountBMin],
    }),
  });
}

/** Real write: remove liquidity. lpAmount is a decimal string of LP tokens to burn. */
export async function removeLiquidity(account, lpAmountDecimalString, slippagePct = 1) {
  const wallet = walletClient();
  const liquidity = parseUnits(lpAmountDecimalString, 18);
  // Minimums left at 0 for simplicity here; a production UI should compute
  // these from current pool share, same pattern as addLiquidity above.
  return wallet.sendTransaction({
    account,
    to: POOL_ADDRESS,
    data: encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'removeLiquidity',
      args: [liquidity, 0n, 0n],
    }),
  });
}