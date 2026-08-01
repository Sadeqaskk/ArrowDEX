import { formatUnits } from 'viem';
import { CHAINS } from './chains';
import { ACTIVITY_SOURCES } from './activityConfig';
import { WUSDC_ADDRESS, ARROW_ADDRESS } from './swapConfig';

const arc = CHAINS.arcTestnet;
const EXPLORER_API_BASE = 'https://testnet.arcscan.app/api/v2';

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
import { keccak256, toHex } from 'viem';

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

async function fetchLogsForAddress(contractAddress) {
  const url = `${EXPLORER_API_BASE}/addresses/${contractAddress}/logs`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Explorer API request failed (${res.status}) for ${contractAddress}`);
  }
  const json = await res.json();
  return json.items || [];
}

export async function fetchActivity(userAddress) {
  if (!userAddress) return [];

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