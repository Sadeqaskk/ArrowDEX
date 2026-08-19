// lib/arrowFactoryClient.js
//
// Client for ArrowFactory (0x04722Bc000D0257C8e7b364975b4d89c0f36a86d).
// Mirrors the chain setup used in lib/swap.js / lib/arrowRouterClient.js.
// Read functions (poolCount, allPools, events) work without a wallet.
// Write functions (createPool, pause/unpause) require a connected wallet
// and will revert on-chain if the caller isn't ArrowFactory's owner.

import { createPublicClient, createWalletClient, custom, http, defineChain } from 'viem';
import { CHAINS } from './chains';
import { getActiveProvider } from './activeProvider';

const arc = CHAINS.arcTestnet;

export const ARROW_FACTORY_ADDRESS = '0x04722Bc000D0257C8e7b364975b4d89c0f36a86d';
export const ARROW_POOL_IMPLEMENTATION_ADDRESS = '0x08C44A7547C3F8E6b23847C65965b437EE0D52d0';
export const ARROW_ROUTER_ADDRESS = '0x94D72FdDC5A6bF52968797699dAce54812934765';
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

const arcViemChain = defineChain({
  id: arc.chainId,
  name: arc.name,
  nativeCurrency: arc.nativeCurrency,
  rpcUrls: { default: { http: [arc.rpcUrl] } },
  blockExplorers: arc.explorer ? { default: { name: `${arc.name} Explorer`, url: arc.explorer } } : undefined,
});

const FACTORY_ABI = [
  {
    type: 'function', name: 'poolCount', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'allPools', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'pool', type: 'address' },
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'createdAt', type: 'uint32' },
    ],
  },
  {
    type: 'function', name: 'owner', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'createPool', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
  {
    type: 'function', name: 'pauseRouter', stateMutability: 'nonpayable',
    inputs: [], outputs: [],
  },
  {
    type: 'function', name: 'unpauseRouter', stateMutability: 'nonpayable',
    inputs: [], outputs: [],
  },
  {
    type: 'event', name: 'PoolCreated', anonymous: false,
    inputs: [
      { name: 'pool', type: 'address', indexed: true },
      { name: 'tokenA', type: 'address', indexed: true },
      { name: 'tokenB', type: 'address', indexed: true },
      { name: 'poolIndex', type: 'uint256', indexed: false },
    ],
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
  if (!provider) throw new Error('No wallet connected.');
  return createWalletClient({ chain: arcViemChain, transport: custom(provider) });
}

// ── Read functions ──────────────────────────────────────────────────────

/** Total number of pools ArrowFactory has created. */
export async function getFactoryPoolCount() {
  const client = getPublicClient();
  const count = await client.readContract({
    address: ARROW_FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'poolCount',
  });
  return Number(count);
}

/** Full list of pools Factory has created, newest first. */
export async function getFactoryPools() {
  const client = getPublicClient();
  const count = await getFactoryPoolCount();
  if (count === 0) return [];

  const contracts = Array.from({ length: count }, (_, i) => ({
    address: ARROW_FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'allPools',
    args: [BigInt(i)],
  }));

  const results = await client.multicall({ multicallAddress: MULTICALL3_ADDRESS, contracts });

  return results
    .map((r, i) => {
      if (r.status !== 'success') return null;
      const [pool, tokenA, tokenB, createdAt] = r.result;
      return { index: i, pool, tokenA, tokenB, createdAt: Number(createdAt) * 1000 };
    })
    .filter(Boolean)
    .reverse(); // newest first
}

/**
 * Poll for new PoolCreated events since a given block (or recent blocks if
 * none given). Used to drive the "live" feed without needing a websocket.
 */
export async function getRecentPoolCreatedEvents({ fromBlock } = {}) {
  const client = getPublicClient();
  const latestBlock = await client.getBlockNumber();
  const start = fromBlock ?? (latestBlock > 5000n ? latestBlock - 5000n : 0n);

  const logs = await client.getLogs({
    address: ARROW_FACTORY_ADDRESS,
    event: FACTORY_ABI.find((e) => e.type === 'event' && e.name === 'PoolCreated'),
    fromBlock: start,
    toBlock: latestBlock,
  });

  return { logs, latestBlock };
}

/** Read the current ArrowFactory owner — used to gate the admin UI. */
export async function getFactoryOwner() {
  const client = getPublicClient();
  return client.readContract({
    address: ARROW_FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'owner',
  });
}

// ── Write functions (owner-only on-chain) ──────────────────────────────

/** Create a new pool. Reverts on-chain if the caller isn't the owner. */
export async function createFactoryPool({ account, tokenA, tokenB, name, symbol, onStatus }) {
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  onStatus?.('Creating pool…');
  const hash = await walletClient.writeContract({
    account,
    chain: arcViemChain,
    address: ARROW_FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'createPool',
    args: [tokenA, tokenB, name, symbol],
  });

  onStatus?.('Waiting for confirmation…');
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Pause/unpause ArrowRouter via Factory's onlyOwner passthrough. */
export async function setRouterPaused({ account, paused, onStatus }) {
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  onStatus?.(paused ? 'Pausing router…' : 'Unpausing router…');
  const hash = await walletClient.writeContract({
    account,
    chain: arcViemChain,
    address: ARROW_FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: paused ? 'pauseRouter' : 'unpauseRouter',
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}