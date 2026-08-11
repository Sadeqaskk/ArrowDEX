import { createPublicClient, http, formatUnits, type PublicClient } from 'viem';
import { getSupabaseServer } from '@/lib/supabase/server';
import { CHAINS, BLOCK_CHUNK_SIZE } from './chains';
import { POOL_ABI, SWAP_ABI, VAULT_ABI, CCTP_ABI, AMM_TOKEN_GETTERS_ABI, ERC20_DECIMALS_ABI, VAULT_TOKEN_GETTER_ABI } from './abis';

const SWAP_FEE_BPS = 30n;
const TIME_BUDGET_MS = 45_000;
const MIN_REQUEST_INTERVAL_MS = 400;
let lastRequestTime = 0;

class BudgetExceededError extends Error {}

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

// Used ONLY for simple, non-log calls (readContract/getBlock/getBlockNumber) —
// these don't recurse, so a couple of retries here is safe and won't compound.
async function rpcCall<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await pace();
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isLimitError(err) || attempt === maxRetries) throw err;
      await sleep(1000 * Math.pow(2, attempt));
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
async function getDecimals(pc: PublicClient, token: `0x${string}`) {
  const key = token.toLowerCase();
  if (decimalsCache.has(key)) return decimalsCache.get(key)!;
  const d = await rpcCall(() =>
    pc.readContract({ address: token, abi: ERC20_DECIMALS_ABI, functionName: 'decimals' })
  );
  decimalsCache.set(key, d as number);
  return d as number;
}

const tokensCache = new Map<string, { tokenA: `0x${string}`; tokenB: `0x${string}` }>();
async function getPoolTokens(pc: PublicClient, cacheKey: string, address: `0x${string}`) {
  if (tokensCache.has(cacheKey)) return tokensCache.get(cacheKey)!;
  const tokenA = (await rpcCall(() =>
    pc.readContract({ address, abi: AMM_TOKEN_GETTERS_ABI, functionName: 'tokenA' })
  )) as `0x${string}`;
  const tokenB = (await rpcCall(() =>
    pc.readContract({ address, abi: AMM_TOKEN_GETTERS_ABI, functionName: 'tokenB' })
  )) as `0x${string}`;
  const result = { tokenA, tokenB };
  tokensCache.set(cacheKey, result);
  return result;
}

const vaultTokenCache = new Map<string, `0x${string}`>();
async function getVaultToken(pc: PublicClient, cacheKey: string, address: `0x${string}`) {
  if (vaultTokenCache.has(cacheKey)) return vaultTokenCache.get(cacheKey)!;
  const token = (await rpcCall(() =>
    pc.readContract({ address, abi: VAULT_TOKEN_GETTER_ABI, functionName: 'stakingToken' })
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

async function blockTimestamp(pc: PublicClient, blockNumber: bigint) {
  const block = await rpcCall(() => pc.getBlock({ blockNumber }));
  return new Date(Number(block.timestamp) * 1000).toISOString();
}

// NO retry/backoff here — a single attempt, then split immediately on a
// limit error. Retrying before splitting was what caused the timeout: delays
// from repeated backoff attempts compounded across every recursive split.
// `deadline` lets this bail out cleanly if we're almost out of time, instead
// of the whole function getting hard-killed by Vercel mid-request.
async function getLogsForEventAdaptive(
  pc: PublicClient,
  address: `0x${string}`,
  eventAbi: any,
  fromBlock: bigint,
  toBlock: bigint,
  deadline: number
): Promise<any[]> {
  if (Date.now() > deadline) throw new BudgetExceededError();
  await pace();
  try {
    return (await pc.getLogs({ address, event: eventAbi, fromBlock, toBlock })) as any[];
  } catch (err: any) {
    if (!isLimitError(err) || fromBlock >= toBlock) throw err;
    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    const left = await getLogsForEventAdaptive(pc, address, eventAbi, fromBlock, mid, deadline);
    const right = await getLogsForEventAdaptive(pc, address, eventAbi, mid + 1n, toBlock, deadline);
    return [...left, ...right];
  }
}

async function getLogsPerEvent(pc: PublicClient, address: `0x${string}`, abi: any[], fromBlock: bigint, toBlock: bigint, deadline: number) {
  const eventAbis = abi.filter((item) => item.type === 'event');
  const allLogs: any[] = [];
  for (const eventAbi of eventAbis) {
    const logs = await getLogsForEventAdaptive(pc, address, eventAbi, fromBlock, toBlock, deadline);
    allLogs.push(...logs);
  }
  allLogs.sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex);
  return allLogs;
}

async function scanAmm(chainKey: string, contractKey: 'pool' | 'swap', address: `0x${string}`, abi: any, pc: PublicClient, runStartTime: number) {
  const deadline = runStartTime + TIME_BUDGET_MS;
  const { tokenA, tokenB } = await getPoolTokens(pc, `${chainKey}:${contractKey}`, address);
  const decA = await getDecimals(pc, tokenA);
  const decB = await getDecimals(pc, tokenB);

  let cursor = await getCursor(chainKey, contractKey);
  const latest = await rpcCall(() => pc.getBlockNumber());

  while (cursor < latest && Date.now() < deadline) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    let logs: any[];
    try {
      logs = await getLogsPerEvent(pc, address, abi, cursor + 1n, toBlock, deadline);
    } catch (err) {
      if (err instanceof BudgetExceededError) break;
      throw err;
    }
    const rows = [];

    for (const log of logs as any[]) {
      const ts = await blockTimestamp(pc, log.blockNumber);
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
  }
}

async function scanVault(chainKey: string, address: `0x${string}`, pc: PublicClient, runStartTime: number) {
  const deadline = runStartTime + TIME_BUDGET_MS;
  const stakingToken = await getVaultToken(pc, chainKey, address);
  const dec = await getDecimals(pc, stakingToken);

  let cursor = await getCursor(chainKey, 'vault');
  const latest = await rpcCall(() => pc.getBlockNumber());

  while (cursor < latest && Date.now() < deadline) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    let logs: any[];
    try {
      logs = await getLogsPerEvent(pc, address, VAULT_ABI as unknown as any[], cursor + 1n, toBlock, deadline);
    } catch (err) {
      if (err instanceof BudgetExceededError) break;
      throw err;
    }
    const rows = [];

    for (const log of logs as any[]) {
      const ts = await blockTimestamp(pc, log.blockNumber);
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
  }
}

async function scanCctp(chainKey: string, address: `0x${string}`, pc: PublicClient, runStartTime: number) {
  const deadline = runStartTime + TIME_BUDGET_MS;
  let cursor = await getCursor(chainKey, 'cctp');
  const latest = await rpcCall(() => pc.getBlockNumber());

  while (cursor < latest && Date.now() < deadline) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    let logs: any[];
    try {
      logs = await getLogsPerEvent(pc, address, CCTP_ABI as unknown as any[], cursor + 1n, toBlock, deadline);
    } catch (err) {
      if (err instanceof BudgetExceededError) break;
      throw err;
    }
    const rows = [];

    for (const log of logs as any[]) {
      const ts = await blockTimestamp(pc, log.blockNumber);
      const decIn = await getDecimals(pc, log.args.burnToken as `0x${string}`);
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
  }
}

export async function runOnce() {
  const runStartTime = Date.now();
  const results: Record<string, string> = {};

  for (const [chainKey, cfg] of Object.entries(CHAINS)) {
    if (Date.now() - runStartTime > TIME_BUDGET_MS) {
      results[chainKey] = 'skipped: time budget exhausted, will resume next run';
      continue;
    }
    const pc = rpcClient(chainKey as keyof typeof CHAINS);
    try {
      if ('pool' in cfg.contracts) await scanAmm(chainKey, 'pool', cfg.contracts.pool as `0x${string}`, POOL_ABI, pc, runStartTime);
      if ('swap' in cfg.contracts) await scanAmm(chainKey, 'swap', cfg.contracts.swap as `0x${string}`, SWAP_ABI, pc, runStartTime);
      if ('vault' in cfg.contracts) await scanVault(chainKey, cfg.contracts.vault as `0x${string}`, pc, runStartTime);
      if ('cctp' in cfg.contracts) await scanCctp(chainKey, cfg.contracts.cctp as `0x${string}`, pc, runStartTime);
      results[chainKey] = 'ok';
    } catch (err: any) {
      console.error(`[${chainKey}] scan error:`, err.message);
      results[chainKey] = `error: ${err.message}`;
    }
  }
  return results;
}