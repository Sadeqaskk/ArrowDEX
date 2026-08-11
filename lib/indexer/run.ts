import { createPublicClient, http, formatUnits, type PublicClient } from 'viem';
import { getSupabaseServer } from '@/lib/supabase/server';
import { CHAINS, BLOCK_CHUNK_SIZE } from './chains';
import { POOL_ABI, SWAP_ABI, VAULT_ABI, CCTP_ABI, ERC20_DECIMALS_ABI, VAULT_TOKEN_GETTER_ABI } from './abis';
import { POOLS, getTokenBySymbol } from '@/lib/swapConfig';

const SWAP_FEE_BPS = 30n;
const TIME_BUDGET_MS = 40_000; // a bit more headroom below Vercel's limit
const MIN_REQUEST_INTERVAL_MS = 2500;
let lastRequestTime = 0;

class BudgetExceededError extends Error {
  constructor() {
    super('time budget exceeded mid-chunk');
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pace() {
  const now = Date.now();
  const wait = lastRequestTime + MIN_REQUEST_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastRequestTime = Date.now();
}

function isLimitError(err: any) {
  const msg = (err?.message || String(err)).toLowerCase();
  return msg.includes('rate limit') || msg.includes('exceeds defined limit');
}

async function rpcCall<T>(fn: () => Promise<T>, deadline: number, maxRetries = 3): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (Date.now() > deadline) throw new BudgetExceededError();
    await pace();
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isLimitError(err) || attempt === maxRetries) throw err;
      await sleep(3000 * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

function rpcClient(chainKey: keyof typeof CHAINS): PublicClient {
  const url = process.env[CHAINS[chainKey].rpcEnv];
  if (!url) throw new Error(`Missing env var ${CHAINS[chainKey].rpcEnv}`);
  return createPublicClient({ transport: http(url) });
}

const decimalsCache = new Map<string, number>();
async function getDecimals(pc: PublicClient, token: `0x${string}`, deadline: number) {
  const key = token.toLowerCase();
  if (decimalsCache.has(key)) return decimalsCache.get(key)!;
  const d = await rpcCall(() =>
    pc.readContract({ address: token, abi: ERC20_DECIMALS_ABI, functionName: 'decimals' }), deadline
  );
  decimalsCache.set(key, d as number);
  return d as number;
}

// Static lookup — pool token addresses and decimals never change, and they're
// already declared in swapConfig.js (POOLS / TOKENS). Resolving this from the
// pool's on-chain address avoids 4 RPC calls (~10s of paced setup) per AMM
// contract, per run, that were only ever going to return the same answer.
const ammTokenInfoCache = new Map<string, { tokenA: `0x${string}`; tokenB: `0x${string}`; decA: number; decB: number }>();
function getAmmTokenInfo(address: `0x${string}`) {
  const key = address.toLowerCase();
  const cached = ammTokenInfoCache.get(key);
  if (cached) return cached;

  const pool = POOLS.find((p) => p.address.toLowerCase() === key);
  if (!pool) throw new Error(`No swapConfig POOLS entry for address ${address}`);
  const tokenA = getTokenBySymbol(pool.tokenA);
  const tokenB = getTokenBySymbol(pool.tokenB);
  if (!tokenA || !tokenB) throw new Error(`Bad token symbols for pool ${pool.key}`);

  const result = {
    tokenA: tokenA.address as `0x${string}`,
    tokenB: tokenB.address as `0x${string}`,
    decA: tokenA.decimals,
    decB: tokenB.decimals,
  };
  ammTokenInfoCache.set(key, result);
  return result;
}

const vaultTokenCache = new Map<string, `0x${string}`>();
async function getVaultToken(pc: PublicClient, cacheKey: string, address: `0x${string}`, deadline: number) {
  if (vaultTokenCache.has(cacheKey)) return vaultTokenCache.get(cacheKey)!;
  const token = (await rpcCall(() =>
    pc.readContract({ address, abi: VAULT_TOKEN_GETTER_ABI, functionName: 'stakingToken' }), deadline
  )) as `0x${string}`;
  vaultTokenCache.set(cacheKey, token);
  return token;
}

async function getCursor(chain: string, contract: string): Promise<bigint> {
  const { data } = await getSupabaseServer()
    .from('indexer_cursor').select('last_block')
    .eq('chain', chain).eq('contract', contract).maybeSingle();
  return data ? BigInt(data.last_block) : 0n;
}

async function setCursor(chain: string, contract: string, block: bigint) {
  await getSupabaseServer().from('indexer_cursor').upsert({
    chain, contract, last_block: block.toString(), updated_at: new Date().toISOString(),
  });
}

async function insertEvents(rows: any[]) {
  if (!rows.length) return;
  const { error } = await getSupabaseServer()
    .from('events')
    .upsert(rows, { onConflict: 'chain,tx_hash,event_type,wallet,amount_in', ignoreDuplicates: true });
  if (error) console.error('insert error', error);
}

// Cached per (chain, blockNumber) — many events land in the same or nearby
// blocks, so this avoids re-paying the 2.5s pace cost for a block we've
// already looked up earlier in this same run.
const blockTimestampCache = new Map<string, string>();
async function blockTimestamp(pc: PublicClient, chainKey: string, blockNumber: bigint, deadline: number) {
  const key = `${chainKey}:${blockNumber}`;
  const cached = blockTimestampCache.get(key);
  if (cached) return cached;
  const block = await rpcCall(() => pc.getBlock({ blockNumber }), deadline);
  const ts = new Date(Number(block.timestamp) * 1000).toISOString();
  blockTimestampCache.set(key, ts);
  return ts;
}

async function getLogsPerEvent(pc: PublicClient, address: `0x${string}`, abi: any[], fromBlock: bigint, toBlock: bigint, deadline: number) {
  const eventAbis = abi.filter((item) => item.type === 'event');
  const allLogs: any[] = [];
  for (const eventAbi of eventAbis) {
    const logs = await rpcCall(() => pc.getLogs({ address, event: eventAbi, fromBlock, toBlock }), deadline);
    allLogs.push(...(logs as any[]));
  }
  allLogs.sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex);
  return allLogs;
}

async function scanAmm(chainKey: string, contractKey: 'pool' | 'swap', address: `0x${string}`, abi: any, pc: PublicClient, runStartTime: number) {
  const deadline = runStartTime + TIME_BUDGET_MS;
  const { tokenA, tokenB, decA, decB } = getAmmTokenInfo(address);

  let cursor = await getCursor(chainKey, contractKey);
  const latest = await rpcCall(() => pc.getBlockNumber(), deadline);

  while (cursor < latest && Date.now() < deadline) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    try {
      const logs = await getLogsPerEvent(pc, address, abi, cursor + 1n, toBlock, deadline);
      const rows = [];

      for (const log of logs as any[]) {
        const ts = await blockTimestamp(pc, chainKey, log.blockNumber, deadline);
        const base = { chain: chainKey, contract: contractKey, tx_hash: log.transactionHash, block_number: Number(log.blockNumber), block_timestamp: ts, raw: log };

        if (log.eventName === 'Swap') {
          const tokenIn = log.args.tokenIn as `0x${string}`;
          const inIsA = tokenIn.toLowerCase() === tokenA.toLowerCase();
          const tokenOut = (log.args.tokenOut ?? (inIsA ? tokenB : tokenA)) as `0x${string}`;
          const decIn = inIsA ? decA : decB;
          const decOut = inIsA ? decB : decA;

          rows.push({
            ...base, event_type: 'swap', wallet: log.args.trader,
            token_in: tokenIn, token_out: tokenOut,
            amount_in: formatUnits(log.args.amountIn, decIn),
            amount_out: formatUnits(log.args.amountOut, decOut),
            fee_amount: formatUnits((log.args.amountIn * SWAP_FEE_BPS) / 10000n, decIn),
          });
        } else if (log.eventName === 'LiquidityAdded') {
          rows.push({
            ...base, event_type: 'add_liquidity', wallet: log.args.provider,
            amount_in: formatUnits(log.args.amountA, decA), amount_out: formatUnits(log.args.amountB, decB),
          });
        } else if (log.eventName === 'LiquidityRemoved') {
          rows.push({
            ...base, event_type: 'remove_liquidity', wallet: log.args.provider,
            amount_in: formatUnits(log.args.amountA, decA), amount_out: formatUnits(log.args.amountB, decB),
          });
        }
      }
      await insertEvents(rows);
      await setCursor(chainKey, contractKey, toBlock);
      cursor = toBlock;
    } catch (err) {
      if (err instanceof BudgetExceededError) break;
      throw err;
    }
  }
}

async function scanVault(chainKey: string, address: `0x${string}`, pc: PublicClient, runStartTime: number) {
  const deadline = runStartTime + TIME_BUDGET_MS;
  const stakingToken = await getVaultToken(pc, chainKey, address, deadline);
  const dec = await getDecimals(pc, stakingToken, deadline);

  let cursor = await getCursor(chainKey, 'vault');
  const latest = await rpcCall(() => pc.getBlockNumber(), deadline);

  while (cursor < latest && Date.now() < deadline) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    try {
      const logs = await getLogsPerEvent(pc, address, VAULT_ABI as unknown as any[], cursor + 1n, toBlock, deadline);
      const rows = [];

      for (const log of logs as any[]) {
        const ts = await blockTimestamp(pc, chainKey, log.blockNumber, deadline);
        const base = { chain: chainKey, contract: 'vault', tx_hash: log.transactionHash, block_number: Number(log.blockNumber), block_timestamp: ts, raw: log };
        if (log.eventName === 'Staked') {
          rows.push({ ...base, event_type: 'stake', wallet: log.args.user, amount_in: formatUnits(log.args.amount, dec) });
        } else if (log.eventName === 'Withdrawn') {
          rows.push({ ...base, event_type: 'unstake', wallet: log.args.user, amount_in: formatUnits(log.args.amount, dec) });
        }
      }
      await insertEvents(rows);
      await setCursor(chainKey, 'vault', toBlock);
      cursor = toBlock;
    } catch (err) {
      if (err instanceof BudgetExceededError) break;
      throw err;
    }
  }
}

async function scanCctp(chainKey: string, address: `0x${string}`, pc: PublicClient, runStartTime: number) {
  const deadline = runStartTime + TIME_BUDGET_MS;
  let cursor = await getCursor(chainKey, 'cctp');
  const latest = await rpcCall(() => pc.getBlockNumber(), deadline);

  while (cursor < latest && Date.now() < deadline) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    try {
      const logs = await getLogsPerEvent(pc, address, CCTP_ABI as unknown as any[], cursor + 1n, toBlock, deadline);
      const rows = [];

      for (const log of logs as any[]) {
        const ts = await blockTimestamp(pc, chainKey, log.blockNumber, deadline);
        const decIn = await getDecimals(pc, log.args.burnToken as `0x${string}`, deadline);
        rows.push({
          chain: chainKey, contract: 'cctp', event_type: 'bridge_burn',
          wallet: log.args.depositor, token_in: log.args.burnToken,
          amount_in: formatUnits(log.args.amount, decIn),
          tx_hash: log.transactionHash, block_number: Number(log.blockNumber),
          block_timestamp: ts, raw: log,
        });
      }
      await insertEvents(rows);
      await setCursor(chainKey, 'cctp', toBlock);
      cursor = toBlock;
    } catch (err) {
      if (err instanceof BudgetExceededError) break;
      throw err;
    }
  }
}

export async function runOnce() {
  const runStartTime = Date.now();
  const deadline = runStartTime + TIME_BUDGET_MS;
  const results: Record<string, string> = {};

  for (const [chainKey, cfg] of Object.entries(CHAINS)) {
    if (Date.now() > deadline) {
      results[chainKey] = 'skipped: time budget exhausted, will resume next run';
      continue;
    }
    const pc = rpcClient(chainKey as keyof typeof CHAINS);
    try {
      // Re-check before EVERY contract, not just once per chain — a chain with
      // several contracts (pool/swap/vault/cctp) can run out of budget between
      // them, not just mid-chunk within one. Each scan*()'s own setup call
      // (getBlockNumber/getVaultToken/etc.) happens before its chunk loop and
      // isn't wrapped in that loop's try/catch, so skip the call entirely once
      // time's up rather than let it throw on the way in.
      if ('pool' in cfg.contracts && Date.now() < deadline) {
        await scanAmm(chainKey, 'pool', cfg.contracts.pool as `0x${string}`, POOL_ABI, pc, runStartTime);
      }
      if ('swap' in cfg.contracts && Date.now() < deadline) {
        await scanAmm(chainKey, 'swap', cfg.contracts.swap as `0x${string}`, SWAP_ABI, pc, runStartTime);
      }
      if ('vault' in cfg.contracts && Date.now() < deadline) {
        await scanVault(chainKey, cfg.contracts.vault as `0x${string}`, pc, runStartTime);
      }
      if ('cctp' in cfg.contracts && Date.now() < deadline) {
        await scanCctp(chainKey, cfg.contracts.cctp as `0x${string}`, pc, runStartTime);
      }
      results[chainKey] = Date.now() < deadline ? 'ok' : 'ok: partial, time budget exhausted mid-chain, will resume next run';
    } catch (err: any) {
      // A BudgetExceededError here means a scan*() setup call (getBlockNumber,
      // getVaultToken, getDecimals) fired just as the deadline passed, before
      // that function's own chunk loop had a chance to catch it. The cursor is
      // untouched in that case — this is a clean, expected stop, not a failure.
      if (err instanceof BudgetExceededError) {
        results[chainKey] = 'ok: partial, time budget exhausted mid-chain, will resume next run';
      } else {
        console.error(`[${chainKey}] scan error:`, err.message);
        results[chainKey] = `error: ${err.message}`;
      }
    }
  }
  return results;
}