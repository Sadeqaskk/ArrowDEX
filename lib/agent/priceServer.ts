// lib/agent/priceServer.ts
// Server-only. Reads live prices using the same contracts/ABI as the real app.
import { createPublicClient, http, formatUnits } from "viem";
import { CHAINS } from "@/lib/chains";
import { POOLS, POOL_VIEW_ABI, getTokenBySymbol } from "@/lib/swapConfig";

const arc = CHAINS.arcTestnet;

let _client: ReturnType<typeof createPublicClient> | null = null;
function getClient() {
  if (!_client) _client = createPublicClient({ transport: http(arc.rpcUrl) });
  return _client;
}

export async function getPoolPrice(pairKey: "WUSDC_ARROW" | "USDC_EURC") {
  const [symA, symB] = pairKey.split("_");
  const pool = POOLS.find(
    (p) => (p.tokenA === symA && p.tokenB === symB) || (p.tokenA === symB && p.tokenB === symA)
  );
  if (!pool) return null;

  const client = getClient();
  const tokenAInfo = getTokenBySymbol(pool.tokenA);
  const tokenBInfo = getTokenBySymbol(pool.tokenB);
  if (!tokenAInfo?.address || !tokenBInfo?.address) return null; // ← updated guard

  const [onChainTokenA, reserves] = await Promise.all([
    client.readContract({ address: pool.address as `0x${string}`, abi: POOL_VIEW_ABI, functionName: "tokenA" }),
    client.readContract({ address: pool.address as `0x${string}`, abi: POOL_VIEW_ABI, functionName: "getReserves" }),
  ]);

  const [rawReserveA, rawReserveB] = reserves as [bigint, bigint];
  const ourTokenAIsOnChainA = tokenAInfo.address.toLowerCase() === (onChainTokenA as string).toLowerCase();
  const reserveARaw = ourTokenAIsOnChainA ? rawReserveA : rawReserveB;
  const reserveBRaw = ourTokenAIsOnChainA ? rawReserveB : rawReserveA;

  const reserveA = Number(formatUnits(reserveARaw, tokenAInfo.decimals));
  const reserveB = Number(formatUnits(reserveBRaw, tokenBInfo.decimals));
  if (reserveA === 0) return null;

  return { pair: pairKey, price: reserveB / reserveA, reserveA, reserveB };
}