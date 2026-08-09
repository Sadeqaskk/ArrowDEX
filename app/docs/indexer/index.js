import 'dotenv/config';
import { createPublicClient, http, formatUnits } from 'viem';
import { createClient } from '@supabase/supabase-js';
import { CHAINS, POLL_INTERVAL_MS, BLOCK_CHUNK_SIZE } from './chains.js';
import { POOL_ABI, SWAP_ABI, VAULT_ABI, CCTP_ABI, AMM_TOKEN_GETTERS_ABI } from './abis.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SWAP_FEE_BPS = 30; // 0.30%, matches ArrowPool/ArrowSwap SWAP_FEE_BPS

function client(chainKey) {
  const rpcUrl = process.env[CHAINS[chainKey].rpcEnv];
  return createPublicClient({ transport: http(rpcUrl) });
}

// --- Token decimals: fetched on-chain once per token, then cached ---
const ERC20_DECIMALS_ABI = [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }];
const decimalsCache = new Map(); // `${chainKey}:${address.toLowerCase()}` -> number

async function getDecimals(publicClient, chainKey, tokenAddress) {
  const key = `${chainKey}:${tokenAddress.toLowerCase()}`;
  if (decimalsCache.has(key)) return decimalsCache.get(key);
  const decimals = await publicClient.readContract({
    address: tokenAddress, abi: ERC20_DECIMALS_ABI, functionName: 'decimals',
  });
  decimalsCache.set(key, decimals);
  return decimals;
}

// Pool/swap pairs read directly from the deployed contract's own tokenA()/tokenB(),
// instead of a hardcoded address list — no risk of a stale or unconfirmed address.
// Cached per (chain, contract) since it never changes for a given deployment.
const contractTokensCache = new Map(); // `${chainKey}:${contractKey}` -> { tokenA, tokenB }

async function getPoolTokens(publicClient, chainKey, contractKey, address) {
  const cacheKey = `${chainKey}:${contractKey}`;
  if (contractTokensCache.has(cacheKey)) return contractTokensCache.get(cacheKey);
  const [tokenA, tokenB] = await Promise.all([
    publicClient.readContract({ address, abi: AMM_TOKEN_GETTERS_ABI, functionName: 'tokenA' }),
    publicClient.readContract({ address, abi: AMM_TOKEN_GETTERS_ABI, functionName: 'tokenB' }),
  ]);
  const result = { tokenA, tokenB };
  contractTokensCache.set(cacheKey, result);
  return result;
}

async function getCursor(chain, contract, fallbackBlock) {
  const { data } = await supabase
    .from('indexer_cursor')
    .select('last_block')
    .eq('chain', chain)
    .eq('contract', contract)
    .maybeSingle();
  return data ? BigInt(data.last_block) : fallbackBlock;
}

async function setCursor(chain, contract, block) {
  await supabase.from('indexer_cursor').upsert({
    chain, contract, last_block: block.toString(), updated_at: new Date().toISOString(),
  });
}

async function insertEvents(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('events').upsert(rows, { onConflict: 'chain,tx_hash,event_type,wallet,amount_in', ignoreDuplicates: true });
  if (error) console.error('insert error', error);
}

async function withTimestamp(publicClient, blockNumber) {
  const block = await publicClient.getBlock({ blockNumber });
  return new Date(Number(block.timestamp) * 1000).toISOString();
}

// --- ArrowPool / ArrowSwap (same event shapes, minor field name differences) ---
async function scanAmmContract(chainKey, contractKey, address, abi, publicClient) {
  // Fetched once per contract (cached across polls) — same pair/decimals for every
  // event this contract will ever emit, no need to re-derive per log.
  const { tokenA, tokenB } = await getPoolTokens(publicClient, chainKey, contractKey, address);
  const decA = await getDecimals(publicClient, chainKey, tokenA);
  const decB = await getDecimals(publicClient, chainKey, tokenB);

  const fromBlock = await getCursor(chainKey, contractKey, 0n);
  const latest = await publicClient.getBlockNumber();
  let cursor = fromBlock;

  while (cursor < latest) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    const logs = await publicClient.getLogs({ address, events: abi, fromBlock: cursor + 1n, toBlock });

    const rows = [];
    for (const log of logs) {
      const ts = await withTimestamp(publicClient, log.blockNumber);
      const base = {
        chain: chainKey, contract: contractKey,
        tx_hash: log.transactionHash, block_number: Number(log.blockNumber),
        block_timestamp: ts, raw: log,
      };
      if (log.eventName === 'Swap') {
        const tokenIn = log.args.tokenIn;
        const inIsA = tokenIn.toLowerCase() === tokenA.toLowerCase();
        // ArrowPool emits tokenOut; ArrowSwap doesn't, so derive it from the known pair
        // instead of guessing (guessing decimals from tokenIn would silently corrupt
        // amount_out whenever the two legs have different decimals).
        const tokenOut = log.args.tokenOut ?? (inIsA ? tokenB : tokenA);
        const decIn = inIsA ? decA : decB;
        const decOut = inIsA ? decB : decA;
        rows.push({
          ...base, event_type: 'swap', wallet: log.args.trader,
          token_in: tokenIn, token_out: tokenOut,
          amount_in: formatUnits(log.args.amountIn, decIn),
          // kept from your original: amountOut isn't guaranteed present on every
          // variant's Swap event, so don't call formatUnits on a possibly-undefined value
          amount_out: log.args.amountOut != null ? formatUnits(log.args.amountOut, decOut) : null,
          fee_amount: formatUnits((log.args.amountIn * BigInt(SWAP_FEE_BPS)) / 10000n, decIn),
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

// --- ArrowVault ---
// NOTE: still hardcoded to 18 decimals, assuming the staking token (ARROW) is 18dp on
// every chain. Confirm that assumption — if the vault's staking token can vary per chain
// or isn't actually 18dp, this needs the same getDecimals() treatment as the AMM/CCTP paths.
async function scanVault(chainKey, address, publicClient) {
  const fromBlock = await getCursor(chainKey, 'vault', 0n);
  const latest = await publicClient.getBlockNumber();
  let cursor = fromBlock;

  while (cursor < latest) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    const logs = await publicClient.getLogs({ address, events: VAULT_ABI, fromBlock: cursor + 1n, toBlock });

    const rows = [];
    for (const log of logs) {
      const ts = await withTimestamp(publicClient, log.blockNumber);
      const base = {
        chain: chainKey, contract: 'vault', tx_hash: log.transactionHash,
        block_number: Number(log.blockNumber), block_timestamp: ts, raw: log,
      };
      if (log.eventName === 'Staked') {
        rows.push({ ...base, event_type: 'stake', wallet: log.args.user, amount_in: formatUnits(log.args.amount, 18) });
      } else if (log.eventName === 'Withdrawn') {
        rows.push({ ...base, event_type: 'unstake', wallet: log.args.user, amount_in: formatUnits(log.args.amount, 18) });
      }
    }
    await insertEvents(rows);
    await setCursor(chainKey, 'vault', toBlock);
    cursor = toBlock;
  }
}

// --- CCTP DepositForBurn, per chain ---
async function scanCctp(chainKey, address, publicClient) {
  const fromBlock = await getCursor(chainKey, 'cctp', 0n);
  const latest = await publicClient.getBlockNumber();
  let cursor = fromBlock;

  while (cursor < latest) {
    const toBlock = cursor + BLOCK_CHUNK_SIZE > latest ? latest : cursor + BLOCK_CHUNK_SIZE;
    const logs = await publicClient.getLogs({ address, events: CCTP_ABI, fromBlock: cursor + 1n, toBlock });

    const rows = [];
    for (const log of logs) {
      const ts = await withTimestamp(publicClient, log.blockNumber);
      // burnToken decimals aren't guaranteed 6dp on every chain — same issue you found
      // with WUSDC on Arc, so this needs the same dynamic lookup as the swap path.
      const decBurn = await getDecimals(publicClient, chainKey, log.args.burnToken);
      rows.push({
        chain: chainKey, contract: 'cctp', event_type: 'bridge_burn',
        wallet: log.args.depositor, token_in: log.args.burnToken,
        amount_in: formatUnits(log.args.amount, decBurn),
        tx_hash: log.transactionHash, block_number: Number(log.blockNumber),
        block_timestamp: ts, raw: log,
      });
    }
    await insertEvents(rows);
    await setCursor(chainKey, 'cctp', toBlock);
    cursor = toBlock;
  }
}

async function runOnce() {
  for (const [chainKey, cfg] of Object.entries(CHAINS)) {
    const pc = client(chainKey);
    try {
      if (cfg.contracts.pool) await scanAmmContract(chainKey, 'pool', cfg.contracts.pool, POOL_ABI, pc);
      if (cfg.contracts.swap) await scanAmmContract(chainKey, 'swap', cfg.contracts.swap, SWAP_ABI, pc);
      if (cfg.contracts.vault) await scanVault(chainKey, cfg.contracts.vault, pc);
      if (cfg.contracts.cctp) await scanCctp(chainKey, cfg.contracts.cctp, pc);
    } catch (err) {
      console.error(`[${chainKey}] scan error:`, err.message);
    }
  }
}

async function main() {
  console.log('Arrow DEX indexer starting...');
  while (true) {
    await runOnce();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main();