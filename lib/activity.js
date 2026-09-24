import { formatUnits, keccak256, toHex } from 'viem';
import { CHAINS } from './chains';
import { ACTIVITY_SOURCES } from './activityConfig';
import { WUSDC_ADDRESS, ARROW_ADDRESS } from './swapConfig';
import { ARROW_FEE_ROUTER } from './kyberMainnet';

const arc = CHAINS.arcTestnet;
const EXPLORER_API_BASE = 'https://testnet.arcscan.app/api/v2';

// ── Arc Mainnet (official explorer, Blockscout) ─────────────────────────
const MAINNET_EXPLORER = 'https://explorer.arc.io';
const MAINNET_EXPLORER_API = `${MAINNET_EXPLORER}/api/v2`;

// ArrowDEX contracts on Arc Mainnet. Swap and add-liquidity are recognised by
// the contract the user's transaction was sent to, so no event ABIs are needed.
const MAINNET_SWAP_ROUTERS = new Set(
  [
    ARROW_FEE_ROUTER, // current ArrowRoute fee router (from lib/kyberMainnet)
    '0x26c6365EFE436CdB0064AA48e790490F21e07FF5', // earlier ArrowUniswapFeeRouter
  ]
    .filter(Boolean)
    .map((a) => a.toLowerCase())
);
const MAINNET_LIQUIDITY_ROUTER = '0xa0238a7A66911e79E31D363f18ac3bb954862aB3'.toLowerCase(); // ArrowDexFeeRouter
const MAINNET_POSITION_MANAGER = '0x6049c9a0e26405C0985f9E3685C87d0aE917f82B'.toLowerCase(); // Uniswap v4 PositionManager

// Bridge transactions sent by the user (CCTP-style burn on the way out, or a
// user-submitted receive on the way in).
const BRIDGE_OUT_METHOD_RE = /depositForBurn|bridge|burn/i;
const BRIDGE_IN_METHOD_RE = /receiveMessage|claim|redeem/i;

// How many explorer pages to walk per request (Blockscout returns ~50 per page).
const MAX_PAGES = 5;

const WUSDC_LOWER = WUSDC_ADDRESS.toLowerCase();
const ARROW_LOWER = ARROW_ADDRESS.toLowerCase();

function tokenSymbol(address) {
  const a = address?.toLowerCase();
  if (a === WUSDC_LOWER) return 'WUSDC';
  if (a === ARROW_LOWER) return 'ARROW';
  return 'token';
}

function describeEvent(eventName, args) {
  switch (eventName) {
    case 'LiquidityAdded':
      return { label: 'Added Liquidity', detail: `${formatUnits(args.amountA, 18)} WUSDC + ${formatUnits(args.amountB, 18)} ARROW`, tone: 'positive' };
    case 'LiquidityRemoved':
      return { label: 'Removed Liquidity', detail: `${formatUnits(args.amountA, 18)} WUSDC + ${formatUnits(args.amountB, 18)} ARROW`, tone: 'neutral' };
    case 'Swap': {
      const inSymbol = tokenSymbol(args.tokenIn);
      const outSymbol = tokenSymbol(args.tokenOut);
      return { label: 'Swap', detail: `${formatUnits(args.amountIn, 18)} ${inSymbol} → ${formatUnits(args.amountOut, 18)} ${outSymbol}`, tone: 'neutral' };
    }
    case 'Staked':
      return { label: 'Staked', detail: `${formatUnits(args.amount, 18)} ARROW-LP`, tone: 'positive' };
    case 'Withdrawn':
      return { label: 'Unstaked', detail: `${formatUnits(args.amount, 18)} ARROW-LP`, tone: 'neutral' };
    case 'RewardPaid':
      return { label: 'Claimed Rewards', detail: `${formatUnits(args.reward, 18)} ARROW`, tone: 'positive' };
    case 'Deposit':
      return { label: 'Wrapped USDC', detail: `+${formatUnits(args.amount, 18)} WUSDC`, tone: 'positive' };
    case 'Withdrawal':
      return { label: 'Unwrapped USDC', detail: `-${formatUnits(args.amount, 18)} WUSDC`, tone: 'neutral' };
    default:
      return { label: eventName, detail: '', tone: 'neutral' };
  }
}

// Blockscout keccak256 topic0 signatures for each event, computed from the
// event signature string. These identify which event a raw log is, since
// the explorer API returns raw topics/data alongside any decoded info it has.
function topic0For(eventAbi) {
  const signature = `${eventAbi.name}(${eventAbi.inputs.map((i) => i.type).join(',')})`;
  return keccak256(toHex(signature));
}

// Build a lookup: topic0 -> { eventAbi, source }
function buildTopicIndex() {
  const index = {};
  for (const source of ACTIVITY_SOURCES) {
    for (const eventAbi of source.events) {
      index[topic0For(eventAbi).toLowerCase()] = { eventAbi, source };
    }
  }
  return index;
}

const TOPIC_INDEX = buildTopicIndex();

// Decode raw (topics, data) into named args per the ABI's inputs order,
// matching indexed vs non-indexed slots.
function decodeLogArgs(eventAbi, topics, data) {
  const args = {};
  let topicIdx = 1; // topics[0] is the event signature itself
  let dataOffset = 2; // skip '0x'

  for (const input of eventAbi.inputs) {
    if (input.indexed) {
      const raw = topics[topicIdx++];
      args[input.name] = input.type === 'address' ? `0x${raw.slice(-40)}` : BigInt(raw);
    } else {
      const chunk = data.slice(dataOffset, dataOffset + 64);
      dataOffset += 64;
      args[input.name] = input.type === 'address' ? `0x${chunk.slice(-40)}` : BigInt(`0x${chunk}`);
    }
  }
  return args;
}

// Walks a Blockscout v2 list endpoint page by page via `next_page_params`,
// so older activity isn't pushed off the first page.
async function fetchPaged(url, baseParams = {}, maxPages = MAX_PAGES) {
  const items = [];
  let params = { ...baseParams };

  for (let page = 0; page < maxPages; page += 1) {
    const clean = Object.entries(params).filter(([, v]) => v !== null && v !== undefined);
    const qs = clean.length ? `?${new URLSearchParams(clean.map(([k, v]) => [k, String(v)])).toString()}` : '';
    const res = await fetch(`${url}${qs}`);
    if (!res.ok) {
      throw new Error(`Explorer API request failed (${res.status}) for ${url}`);
    }
    const json = await res.json();
    items.push(...(json.items || []));
    if (!json.next_page_params) break;
    params = { ...baseParams, ...json.next_page_params };
  }
  return items;
}

async function fetchLogsForAddress(contractAddress) {
  return fetchPaged(`${EXPLORER_API_BASE}/addresses/${contractAddress}/logs`);
}

// ── Testnet (unchanged behaviour) ────────────────────────────────────────
async function fetchTestnetActivity(userAddress) {
  const userLower = userAddress.toLowerCase();
  const allEvents = [];
  const errors = [];

  // One request per contract (Pool, Vault, WUSDC) instead of one per event —
  // the explorer already has everything indexed, so we filter client-side.
  const uniqueAddresses = [...new Set(ACTIVITY_SOURCES.map((s) => s.address))];

  for (const contractAddress of uniqueAddresses) {
    try {
      const logs = await fetchLogsForAddress(contractAddress);

      for (const log of logs) {
        const topic0 = (log.topics?.[0] || '').toLowerCase();
        const match = TOPIC_INDEX[topic0];
        if (!match) continue; // not one of our known events

        const { eventAbi, source } = match;
        if (source.address.toLowerCase() !== contractAddress.toLowerCase()) continue;

        let args;
        try {
          args = decodeLogArgs(eventAbi, log.topics, log.data);
        } catch {
          continue;
        }

        // Filter to this user: check the first indexed address-type input.
        const userParam = eventAbi.inputs.find((i) => i.indexed && i.type === 'address');
        if (userParam && args[userParam.name]?.toLowerCase() !== userLower) continue;

        allEvents.push({
          id: `${log.transaction_hash}-${log.index}`,
          eventName: eventAbi.name,
          source: source.label,
          args,
          blockNumber: BigInt(log.block_number),
          transactionHash: log.transaction_hash,
          timestamp: log.block_timestamp ? new Date(log.block_timestamp).getTime() : null,
          ...describeEvent(eventAbi.name, args),
        });
      }
    } catch (err) {
      console.error(`Failed to fetch logs for ${contractAddress}:`, err);
      errors.push({ address: contractAddress, message: err.message });
    }
  }

  allEvents.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));

  if (errors.length) {
    console.warn('[activity] completed with partial failures:', errors);
  }

  return allEvents;
}

// ── Mainnet helpers ──────────────────────────────────────────────────────

// Amount for display: up to 6 decimals (8 for 8-decimal tokens like cirBTC),
// trailing zeros trimmed, no rounding surprises.
function fmtAmount(raw, decimals) {
  const s = formatUnits(raw, decimals);
  const [whole, frac = ''] = s.split('.');
  const trimmed = frac.slice(0, decimals === 8 ? 8 : 6).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function joinAmounts(list, sep = ' + ') {
  return list.map((a) => `${fmtAmount(a.raw, a.decimals)} ${a.symbol}`).join(sep);
}

// Groups the user's ERC-20 transfers by transaction hash.
function groupTransfers(transfers, userLower) {
  const byHash = new Map();

  for (const t of transfers) {
    const hash = t.transaction_hash || t.tx_hash;
    const rawValue = t.total?.value;
    if (!hash || rawValue == null) continue; // skips NFTs (position tokens) and malformed rows

    const from = (t.from?.hash || '').toLowerCase();
    const to = (t.to?.hash || '').toLowerCase();
    const decimals = Number(t.total?.decimals ?? t.token?.decimals ?? 18);
    const symbol = t.token?.symbol || 'token';
    const tokenKey = (t.token?.address_hash || t.token?.address || symbol).toLowerCase();

    let flow = byHash.get(hash);
    if (!flow) {
      flow = {
        sent: new Map(),
        received: new Map(),
        minted: false,
        timestamp: t.timestamp || null,
        blockNumber: t.block_number ?? null,
      };
      byHash.set(hash, flow);
    }

    const amount = BigInt(rawValue);
    const add = (map) => {
      const prev = map.get(tokenKey);
      map.set(tokenKey, { symbol, decimals, raw: (prev?.raw ?? 0n) + amount });
    };

    if (from === userLower) add(flow.sent);
    if (to === userLower) {
      add(flow.received);
      if (t.type === 'token_minting') flow.minted = true;
    }
  }

  return byHash;
}

// Net per-token flows for the user in one transaction, so a refund of unused
// tokens doesn't show up as a second leg of the trade.
function netFlows(flow) {
  const sent = [];
  const received = [];
  if (!flow) return { sent, received };

  const keys = new Set([...flow.sent.keys(), ...flow.received.keys()]);
  for (const key of keys) {
    const s = flow.sent.get(key);
    const r = flow.received.get(key);
    const sv = s?.raw ?? 0n;
    const rv = r?.raw ?? 0n;
    const meta = s || r;
    if (sv > rv) sent.push({ ...meta, raw: sv - rv });
    else if (rv > sv) received.push({ ...meta, raw: rv - sv });
  }
  return { sent, received };
}

function mainnetEvent({ hash, timestamp, blockNumber, kind, label, detail, tone, eventName, source }) {
  let block = 0n;
  try { block = BigInt(blockNumber ?? 0); } catch { /* keep 0n */ }
  return {
    id: `${hash}-${kind}`,
    eventName,
    source,
    args: {},
    blockNumber: block,
    transactionHash: hash,
    timestamp: timestamp ? new Date(timestamp).getTime() : null,
    explorer: MAINNET_EXPLORER,
    label,
    detail,
    tone,
  };
}

// ── Mainnet: Swap, Liquidity, Bridge ─────────────────────────────────────
async function fetchMainnetActivity(userAddress) {
  const userLower = userAddress.toLowerCase();

  const [txResult, transferResult] = await Promise.allSettled([
    fetchPaged(`${MAINNET_EXPLORER_API}/addresses/${userAddress}/transactions`),
    fetchPaged(`${MAINNET_EXPLORER_API}/addresses/${userAddress}/token-transfers`, { type: 'ERC-20' }),
  ]);

  if (txResult.status === 'rejected') {
    console.error('[activity] mainnet transactions failed:', txResult.reason);
    throw txResult.reason instanceof Error ? txResult.reason : new Error('Failed to load Arc Mainnet transactions.');
  }
  if (transferResult.status === 'rejected') {
    console.warn('[activity] mainnet token transfers failed — amounts will be missing:', transferResult.reason);
  }

  const txs = txResult.value;
  const transfers = transferResult.status === 'fulfilled' ? transferResult.value : [];
  const flowsByHash = groupTransfers(transfers, userLower);

  const events = [];
  const seen = new Set();

  // 1) Transactions the user sent themselves.
  for (const tx of txs) {
    if (tx.status === 'error') continue; // failed txs aren't activity
    const hash = tx.hash;
    if (!hash) continue;

    const to = (tx.to?.hash || '').toLowerCase();
    const method = tx.method || '';
    const flow = flowsByHash.get(hash);
    const { sent, received } = netFlows(flow);
    const common = { hash, timestamp: tx.timestamp, blockNumber: tx.block_number ?? tx.block };

    if (MAINNET_SWAP_ROUTERS.has(to)) {
      const detail = sent.length && received.length
        ? `${joinAmounts(sent)} → ${joinAmounts(received)}`
        : '';
      events.push(mainnetEvent({
        ...common, kind: 'swap', source: 'Swap', eventName: 'Swap',
        label: 'Swap', detail, tone: 'neutral',
      }));
      seen.add(hash);
      continue;
    }

    if (to === MAINNET_LIQUIDITY_ROUTER || to === MAINNET_POSITION_MANAGER) {
      // The ArrowDEX fee router only adds. PositionManager calls are direct:
      // tokens coming back = removal, tokens going out = add.
      const isAdd = to === MAINNET_LIQUIDITY_ROUTER || (sent.length > 0 && received.length === 0);
      const isRemove = !isAdd && received.length > 0 && sent.length === 0;

      if (isAdd) {
        events.push(mainnetEvent({
          ...common, kind: 'liquidity', source: 'Liquidity', eventName: 'LiquidityAdded',
          label: 'Added Liquidity', detail: joinAmounts(sent), tone: 'positive',
        }));
      } else if (isRemove) {
        events.push(mainnetEvent({
          ...common, kind: 'liquidity', source: 'Liquidity', eventName: 'LiquidityRemoved',
          label: 'Removed Liquidity', detail: joinAmounts(received), tone: 'neutral',
        }));
      } else {
        events.push(mainnetEvent({
          ...common, kind: 'liquidity', source: 'Liquidity', eventName: 'Liquidity',
          label: 'Updated Position', detail: '', tone: 'neutral',
        }));
      }
      seen.add(hash);
      continue;
    }

    if (BRIDGE_IN_METHOD_RE.test(method) || flow?.minted) {
      events.push(mainnetEvent({
        ...common, kind: 'bridge', source: 'Bridge', eventName: 'Bridge',
        label: 'Bridged In', detail: joinAmounts(received, ' + '), tone: 'positive',
      }));
      seen.add(hash);
      continue;
    }

    if (BRIDGE_OUT_METHOD_RE.test(method)) {
      events.push(mainnetEvent({
        ...common, kind: 'bridge', source: 'Bridge', eventName: 'Bridge',
        label: 'Bridged Out', detail: joinAmounts(sent, ' + '), tone: 'neutral',
      }));
      seen.add(hash);
    }
    // Anything else (approvals, plain transfers, wrapping) isn't shown.
  }

  // 2) Inbound bridge mints executed by someone else (relayer) never appear in
  //    the user's own transaction list — pick them up from the token transfers.
  for (const [hash, flow] of flowsByHash) {
    if (seen.has(hash) || !flow.minted) continue;
    const { received } = netFlows(flow);
    events.push(mainnetEvent({
      hash,
      timestamp: flow.timestamp,
      blockNumber: flow.blockNumber,
      kind: 'bridge', source: 'Bridge', eventName: 'Bridge',
      label: 'Bridged In', detail: joinAmounts(received), tone: 'positive',
    }));
  }

  events.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
  return events;
}

export async function fetchActivity(userAddress, networkMode = 'testnet') {
  if (!userAddress) return [];
  if (networkMode === 'mainnet') return fetchMainnetActivity(userAddress);
  return fetchTestnetActivity(userAddress);
}