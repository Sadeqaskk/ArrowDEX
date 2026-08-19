// lib/arrowRouterClient.js
//
// ArrowRouter client — mirrors lib/swap.js exactly (same chain setup,
// same wallet/provider handling, same network-switch guard, reuses
// ERC20_ABI from swapConfig instead of redefining it). Standalone module:
// does not import from or modify lib/swap.js.

import { createPublicClient, createWalletClient, custom, http, formatUnits, parseUnits, defineChain } from 'viem';
import { CHAINS } from './chains';
import { ERC20_ABI } from './swapConfig';
import { getActiveProvider } from './activeProvider';

const arc = CHAINS.arcTestnet;

export const ARROW_ROUTER_ADDRESS = '0x94D72FdDC5A6bF52968797699dAce54812934765';

const arcViemChain = defineChain({
  id: arc.chainId,
  name: arc.name,
  nativeCurrency: arc.nativeCurrency,
  rpcUrls: { default: { http: [arc.rpcUrl] } },
  blockExplorers: arc.explorer ? { default: { name: `${arc.name} Explorer`, url: arc.explorer } } : undefined,
});

const ARROW_ROUTER_ABI = [
  {
    type: 'function', name: 'getBestPath', stateMutability: 'view',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'path', type: 'address[]' },
      { name: 'pools', type: 'address[]' },
      { name: 'amountOut', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'getPriceImpactBps', stateMutability: 'view',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [{ name: 'impactBps', type: 'uint256' }],
  },
  {
    type: 'function', name: 'swapExactTokensForTokens', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
];

let _publicClient = null;
function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain: arcViemChain, transport: http(arc.rpcUrl) });
  }
  return _publicClient;
}

function getWalletClient() {
  const provider = getActiveProvider();
  if (!provider) {
    throw new Error('No wallet connected.');
  }
  return createWalletClient({ chain: arcViemChain, transport: custom(provider) });
}

async function ensureArcNetwork() {
  const provider = getActiveProvider();
  if (!provider) throw new Error('No wallet connected.');
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: arc.chainIdHex }] });
  } catch (err) {
    if (err.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: arc.chainIdHex, chainName: arc.name, nativeCurrency: arc.nativeCurrency,
          rpcUrls: [arc.rpcUrl], blockExplorerUrls: [arc.explorer],
        }],
      });
    } else {
      throw err;
    }
  }
}

/**
 * Quote the best route from ArrowRouter for tokenIn -> tokenOut.
 * @param {object} p
 * @param {string} p.tokenInAddress
 * @param {string} p.tokenOutAddress
 * @param {number} p.decimalsIn
 * @param {number} p.decimalsOut
 * @param {string} p.amountIn - human decimal string, e.g. "1000"
 */
export async function getBestRoute({ tokenInAddress, tokenOutAddress, decimalsIn, decimalsOut, amountIn }) {
  if (!amountIn || parseFloat(amountIn) <= 0) {
    return { path: [], pools: [], amountOut: '0', amountOutRaw: 0n, priceImpactBps: 0n };
  }

  const client = getPublicClient();
  const amountInRaw = parseUnits(amountIn, decimalsIn);

  const [[path, pools, amountOutRaw], priceImpactBps] = await Promise.all([
    client.readContract({
      address: ARROW_ROUTER_ADDRESS,
      abi: ARROW_ROUTER_ABI,
      functionName: 'getBestPath',
      args: [tokenInAddress, tokenOutAddress, amountInRaw],
    }),
    client.readContract({
      address: ARROW_ROUTER_ADDRESS,
      abi: ARROW_ROUTER_ABI,
      functionName: 'getPriceImpactBps',
      args: [tokenInAddress, tokenOutAddress, amountInRaw],
    }),
  ]);

  return {
    path,
    pools,
    amountOut: path.length > 0 ? formatUnits(amountOutRaw, decimalsOut) : '0',
    amountOutRaw,
    priceImpactBps,
  };
}

async function approveIfNeeded(tokenAddress, account, amount, spenderAddress, onStatus) {
  const publicClient = getPublicClient();
  const currentAllowance = await publicClient.readContract({
    address: tokenAddress, abi: ERC20_ABI, functionName: 'allowance',
    args: [account, spenderAddress],
  });

  if (currentAllowance >= amount) return null;

  onStatus?.('Approving ArrowRouter…');
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: tokenAddress, abi: ERC20_ABI, functionName: 'approve',
    args: [spenderAddress, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Execute a swap through ArrowRouter: switches network if needed, approves
 * if needed, then swaps. Mirrors executeSwap's shape from lib/swap.js.
 */
export async function executeRouterSwap({
  account,
  tokenInAddress,
  tokenOutAddress,
  decimalsIn,
  amountIn,
  minAmountOutRaw, // bigint — already computed with slippage applied
  onStatus,
}) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  const amountInRaw = parseUnits(amountIn, decimalsIn);

  onStatus?.('Checking approval…');
  await approveIfNeeded(tokenInAddress, account, amountInRaw, ARROW_ROUTER_ADDRESS, onStatus);

  onStatus?.('Swapping…');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  const hash = await walletClient.writeContract({
    account,
    chain: arcViemChain,
    address: ARROW_ROUTER_ADDRESS,
    abi: ARROW_ROUTER_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [tokenInAddress, tokenOutAddress, amountInRaw, minAmountOutRaw, account, deadline],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export function bpsToPercent(bps) {
  return (Number(bps) / 100).toFixed(2) + '%';
}