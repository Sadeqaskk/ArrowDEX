// lib/uniV4Price.js
// Converts a v4 pool's sqrtPriceX96 into human prices, handling token
// decimals and token order (currency0 vs currency1).

// Which token is shown as the "1 X = ..." side. Higher number = base.
// cirBTC pairs show "1 cirBTC = ... ", USDC/EURC shows "1 EURC = ... USDC".
const BASE_PRIORITY = { cirBTC: 3, EURC: 2, USDC: 1 };

function rawPrice0In1(sqrtPriceX96, poolCfg) {
  if (sqrtPriceX96 === undefined || sqrtPriceX96 === null || !poolCfg) return null;
  const sqrt = Number(BigInt(sqrtPriceX96)) / 2 ** 96;
  if (!(sqrt > 0)) return null;
  const { currency0: c0, currency1: c1 } = poolCfg;
  const p = sqrt * sqrt * 10 ** (c0.decimals - c1.decimals);
  return Number.isFinite(p) && p > 0 ? p : null;
}

/**
 * Works for ANY pool (cirBTC/USDC, USDC/EURC, cirBTC/EURC), including pools
 * where discovery flipped the token order or swapped in native USDC.
 * Returns { base, quote, price, inverse } where
 *   price   = how many `quote` one `base` costs
 *   inverse = how many `base` one `quote` costs
 * or null if the pool has no price yet.
 */
export function getPoolDisplayPrice(sqrtPriceX96, poolCfg) {
  const p = rawPrice0In1(sqrtPriceX96, poolCfg);
  if (p === null) return null;
  const c0 = poolCfg.currency0;
  const c1 = poolCfg.currency1;
  const baseIs0 = (BASE_PRIORITY[c0.symbol] ?? 0) >= (BASE_PRIORITY[c1.symbol] ?? 0);
  return baseIs0
    ? { base: c0.symbol, quote: c1.symbol, price: p, inverse: 1 / p }
    : { base: c1.symbol, quote: c0.symbol, price: 1 / p, inverse: p };
}

// Kept for compatibility with the earlier version.
export function getHumanPrice(sqrtPriceX96, poolCfg, baseSymbol, quoteSymbol) {
  const p = rawPrice0In1(sqrtPriceX96, poolCfg);
  if (p === null) return null;
  const c0 = poolCfg.currency0;
  const c1 = poolCfg.currency1;
  if (c0.symbol === baseSymbol && c1.symbol === quoteSymbol) return p;
  if (c1.symbol === baseSymbol && c0.symbol === quoteSymbol) return 1 / p;
  return null;
}

export function formatPrice(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  if (p >= 100) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return p.toLocaleString('en-US', { maximumSignificantDigits: 4 });
}