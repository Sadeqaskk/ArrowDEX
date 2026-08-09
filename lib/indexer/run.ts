import { createPublicClient, http, formatUnits, type PublicClient } from 'viem';
import { getSupabaseServer } from '@/lib/supabase/server';
import { CHAINS, BLOCK_CHUNK_SIZE } from './chains';
import { POOL_ABI, SWAP_ABI, VAULT_ABI, CCTP_ABI, AMM_TOKEN_GETTERS_ABI, ERC20_DECIMALS_ABI, VAULT_TOKEN_GETTER_ABI } from './abis';

const SWAP_FEE_BPS = 30n;

function rpcClient(chainKey: keyof typeof CHAINS): PublicClient {
  const url = process.env[CHAINS[chainKey].rpcEnv];
  if (!url) throw new Error(`Missing env var ${CHAINS[chainKey].rpcEnv}`);
  return createPublicClient({ transport: http(url) });
}

const decimalsCache = new Map<string, number>();
async function getDecimals(pc: PublicClient, token: `0x${string}`) {
  const key = token.toLowerCase();
  if (decimalsCache.has(key)) return decimalsCache.get(key)!;
  const d = await pc.readContract({ address: token, abi: ERC20_DECIMALS_ABI, functionName: 'decimals' });
  decimalsCache.set(key, d as number);
  return d as number;
}

const tokensCache = new Map<string, { tokenA: `0x${string}`; tokenB: `0x${string}` }>();
async function getPoolTokens(pc: PublicClient, cacheKey: string, address: `0x${string}`) {
  if (tokensCache.has(cacheKey)) return tokensCache.get(cacheKey)!;
  const [tokenA, tokenB] = await Promise.all([
    pc.readContract({ address, abi: AMM_TOKEN_GETTERS_ABI, functionName: 'tokenA' }) as Promise<`0x${string}`>,
    pc.readContract({ address, abi: AMM_TOKEN_GETTERS_ABI, functionName: 'tokenB' }) as Promise<`0x${string}`>,
  ]);
  const result = { tokenA, tokenB };
  tokensCache.set(cacheKey, result);
  return result;
}

// The vault wraps a separate staking token rather than being one itself —
// fetched once per (chain, vault contract) and cached, same pattern as getPoolTokens.
const vaultTokenCache = new Map<string, `0x${string}`>();
async function getVaultToken(pc: PublicClient, cacheKey: string, address: `0x${string}`) {
  if (vaultTokenCache.has(cacheKey)) return vaultTokenCache.get(cacheKey)!;
  const token = (await pc.readContract({
    address, abi: VAULT_TOKEN_GETTER_ABI, functionName: 'stakingToken',
  })) as `0x${string}`;
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
  const block = await pc.getBlock({ blockNumber });
  return new Date(Number(block.timestamp) * 1000).toISOString();
}

async function scanAmm(chainKey: string, contractKey: 'pool' | 'swap', address: `0x${string}`, abi: any, pc: PublicClient) {
  const { tokenA, tokenB } = await getPoolTokens(pc, `${chainKey}:${contractKey}`, address);
  const [decA, decB] = await Promise.all([getDecimals(pc, tokenA), getDecimals(pc, tokenB)]);

  let cursor = await getCursor(chainKey, contractKey);
  const latest = await pc.getBlockNumber();

  while (cursor < latest) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    const logs = await pc.getLogs({ address, events: abi, fromBlock: cursor + 1n, toBlock });
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

async function scanVault(chainKey: string, address: `0x${string}`, pc: PublicClient) {
  const stakingToken = await getVaultToken(pc, chainKey, address);
  const dec = await getDecimals(pc, stakingToken);

  let cursor = await getCursor(chainKey, 'vault');
  const latest = await pc.getBlockNumber();

  while (cursor < latest) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    const logs = await pc.getLogs({ address, events: VAULT_ABI, fromBlock: cursor + 1n, toBlock });
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

async function scanCctp(chainKey: string, address: `0x${string}`, pc: PublicClient) {
  let cursor = await getCursor(chainKey, 'cctp');
  const latest = await pc.getBlockNumber();

  while (cursor < latest) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    const logs = await pc.getLogs({ address, events: CCTP_ABI, fromBlock: cursor + 1n, toBlock });
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
  const results: Record<string, string> = {};
  for (const [chainKey, cfg] of Object.entries(CHAINS)) {
    const pc = rpcClient(chainKey as keyof typeof CHAINS);
    try {
      if ('pool' in cfg.contracts) await scanAmm(chainKey, 'pool', cfg.contracts.pool as `0x${string}`, POOL_ABI, pc);
      if ('swap' in cfg.contracts) await scanAmm(chainKey, 'swap', cfg.contracts.swap as `0x${string}`, SWAP_ABI, pc);
      if ('vault' in cfg.contracts) await scanVault(chainKey, cfg.contracts.vault as `0x${string}`, pc);
      if ('cctp' in cfg.contracts) await scanCctp(chainKey, cfg.contracts.cctp as `0x${string}`, pc);
      results[chainKey] = 'ok';
    } catch (err: any) {
      console.error(`[${chainKey}] scan error:`, err.message);
      results[chainKey] = `error: ${err.message}`;
    }
  }
  return results;
}