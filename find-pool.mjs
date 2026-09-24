import { createPublicClient, http, parseAbiItem } from 'viem';

const RPC = 'https://rpc.mainnet.arc.io';
const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
const CIRBTC = '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0';

const client = createPublicClient({ transport: http(RPC) });
console.log('chainId (expect 5042):', await client.getChainId());

const initEvent = parseAbiItem(
  'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)'
);

const latest = await client.getBlockNumber();
const CHUNK = 50_000n;
const MAX_CHUNKS = 100n;
const found = [];

for (let i = 0n; i < MAX_CHUNKS; i++) {
  const toBlock = latest - i * CHUNK;
  if (toBlock <= 0n) break;
  const fromBlock = toBlock - CHUNK + 1n > 0n ? toBlock - CHUNK + 1n : 0n;
  try {
    const [a, b] = await Promise.all([
      client.getLogs({ address: POOL_MANAGER, event: initEvent, args: { currency0: CIRBTC }, fromBlock, toBlock }),
      client.getLogs({ address: POOL_MANAGER, event: initEvent, args: { currency1: CIRBTC }, fromBlock, toBlock }),
    ]);
    found.push(...a, ...b);
  } catch (e) {
    console.log(`chunk ${fromBlock}-${toBlock} failed:`, e.shortMessage ?? e.message);
  }
}

if (!found.length) console.log('No Initialize events found for cirBTC: no such pool on this PoolManager.');
for (const l of found) {
  const a = l.args;
  console.log('---');
  console.log('poolId       :', a.id);
  console.log('currency0    :', a.currency0);
  console.log('currency1    :', a.currency1);
  console.log('fee          :', a.fee);
  console.log('tickSpacing  :', a.tickSpacing);
  console.log('hooks        :', a.hooks);
  console.log('initial tick :', a.tick);
}
