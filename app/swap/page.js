'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AppShell from '../../components/AppShell';
import Modal from '../../components/Modal';
import RouteEngineToggle from '../../components/RouteEngineToggle';
import { useWallet } from '../../lib/WalletContext';
import { TOKENS, findPool } from '../../lib/swapConfig';
import { getPoolState, quoteSwap, executeSwap } from '../../lib/swap';
import { getBestRoute, executeRouterSwap } from '../../lib/arrowRouterClient';
import {
  MAINNET_TOKENS,
  MAINNET_READY,
  ARROW_FEE_ROUTER,
  mainnetExplorerTx,
  mainnetExplorerAddr,
  getMainnetBalances,
  readFeeBps,
  splitFee,
  parseAmount,
  formatRaw,
  computeSpendable,
  getUniQuote,
  executeUniSwap,
} from '../../lib/kyberMainnet';
import { useNotify } from '../../components/NotificationProvider';

// ── Config ──────────────────────────────────────────────────────────────
// How often the pool state silently refreshes in the background (ms).
const AUTO_REFRESH_MS = 20000;
// Price-impact thresholds for the color/warning system.
const IMPACT_WARN = 1; // %
const IMPACT_DANGER = 3; // %
const IMPACT_BLOCK = 5; // % — requires explicit confirmation to proceed
const EXPLORER_TX = (hash) => `https://testnet.arcscan.app/tx/${hash}`;
const EXPLORER_ADDR = (addr) => `https://testnet.arcscan.app/address/${addr}`;
// Debounce for router quoting (ms) — avoids spamming RPC on every keystroke.
const ROUTER_QUOTE_DEBOUNCE_MS = 350;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const msg = (err && err.message) || '';
  return msg.includes('request limit reached') || msg.includes('rate limit') || msg.includes('429');
}

function fmt(n, max = 4) {
  const v = parseFloat(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString(undefined, { maximumFractionDigits: max });
}

function TokenIcon({ token, className }) {
  if (token?.logo) {
    return <img src={token.logo} alt={token.symbol} className={`${className} object-cover flex-shrink-0`} />;
  }
  return <span className={`${className} rounded-full bg-gradient-to-br ${token?.color || 'from-indigo to-indigo-bright'} flex-shrink-0`} />;
}

// Distinctive mark for the pool contract itself — the ArrowSwap logo asset,
// so the badge reads as "infrastructure", not just another token icon.
function EngineLogo({ className = 'w-6 h-6' }) {
  return (
    <span className={`${className} flex-shrink-0 rounded-full p-[1px] bg-gradient-to-br from-indigo-bright/70 via-laser/50 to-violetglow/70`}>
      <img
        src="/fonts/tokens/arrow.png"
        alt="ArrowSwap Engine"
        className="w-full h-full rounded-full object-cover bg-black"
      />
    </span>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 2) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// Testnet ↔ Mainnet pill — same look as dashboard/bridge. Mainnet stays locked
// on "Soon" until the Arc Mainnet swap contracts are configured (mainnetReady).
function NetworkModeToggle({ mode, onChange, mainnetReady = false }) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/5 bg-white/[0.02] p-0.5">
      {['testnet', 'mainnet'].map((m) => {
        const locked = m === 'mainnet' && !mainnetReady;
        return (
          <button
            key={m}
            onClick={() => !locked && onChange(m)}
            disabled={locked}
            className={`px-3 py-1 rounded-full text-[10.5px] font-mono font-semibold uppercase tracking-wide transition-colors flex items-center gap-1.5 ${
              locked
                ? 'text-dim/50 cursor-not-allowed'
                : mode === m
                  ? 'bg-indigo/25 text-indigo-bright'
                  : 'text-dim hover:text-ivory'
            }`}
          >
            {m}
            {locked && (
              <span className="text-[8.5px] font-semibold normal-case tracking-normal bg-white/5 text-dim px-1.5 py-0.5 rounded-full">
                Soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function SwapPage() {
  const { address, isConnected, connect, networkMode, setNetworkMode } = useWallet();
  const notify = useNotify();

  // Mainnet (ArrowRoute, via KyberSwap's aggregator) is only active once lib/kyberMainnet.js is configured.
  // Until then this page behaves exactly like the testnet-only version.
  const isMainnet = networkMode === 'mainnet' && MAINNET_READY;

  // If the shared mode was left on mainnet from another page but mainnet swaps
  // aren't configured yet, switch it back so the pill matches the page.
  useEffect(() => {
    if (networkMode === 'mainnet' && !MAINNET_READY) setNetworkMode('testnet');
  }, [networkMode, setNetworkMode]);

  const [poolState, setPoolState] = useState(null);
  const [poolUpdatedAt, setPoolUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const refreshingRef = useRef(false);

  const [payToken, setPayToken] = useState('USDC');
  const [receiveToken, setReceiveToken] = useState('EURC');
  const [payAmount, setPayAmount] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('0.00');
  const [quoting, setQuoting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(null); // 'pay' | 'receive' | null
  const [pickerQuery, setPickerQuery] = useState('');

  // Rate ticker
  const [unitRate, setUnitRate] = useState(null); // amount of `receiveToken` per 1 `payToken`
  const [rateFlipped, setRateFlipped] = useState(false);

  // Slippage / settings
  const [slippage, setSlippage] = useState(0.5);
  const [customSlippage, setCustomSlippage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Contract / engine info
  const [engineOpen, setEngineOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Router mode (testnet) ───────────────────────────────────────────
  // 'direct'  -> unchanged existing behavior, calls lib/swap.js directly
  // 'router'  -> quotes/executes through the deployed ArrowRouter contract
  const [engineMode, setEngineMode] = useState('direct');
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routeRequestId = useRef(0);

  // ── Mainnet (ArrowRoute) state ───────────────────────────────────────
  const [mainnetBalances, setMainnetBalances] = useState(null); // { USDC: '1.23', ... }
  const [feeBps, setFeeBps] = useState(null); // ArrowDEX fee, read from the fee router
  const [feeError, setFeeError] = useState(false);
  const [uniQuote, setUniQuote] = useState(null);
  const [uniLoading, setUniLoading] = useState(false);
  const [uniError, setUniError] = useState(null);
  const uniRequestId = useRef(0);

  // Impact confirmation gate
  const [impactAck, setImpactAck] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(0); // 0 confirm, 1 submitted, 2 confirmed
  const [modalStatus, setModalStatus] = useState('');
  const [modalError, setModalError] = useState(null);
  const [modalDone, setModalDone] = useState(false);
  const [txHash, setTxHash] = useState(null);

  const tokenList = isMainnet ? MAINNET_TOKENS : TOKENS;
  const payTokenData = tokenList.find((t) => t.symbol === payToken);
  const receiveTokenData = tokenList.find((t) => t.symbol === receiveToken);
  const pool = isMainnet ? null : findPool(payToken, receiveToken); // null = no direct pool for this pair

  const payBalance = isMainnet
    ? (mainnetBalances ? mainnetBalances[payToken] : null)
    : (poolState ? poolState.balancesFormatted[payToken] : null);
  const receiveBalance = isMainnet
    ? (mainnetBalances ? mainnetBalances[receiveToken] : null)
    : (poolState ? poolState.balancesFormatted[receiveToken] : null);

  const engineAddress = isMainnet
    ? ARROW_FEE_ROUTER
    : (pool?.address || pool?.contractAddress || pool?.poolAddress || null);
  const engineName = isMainnet
    ? 'ArrowRoute'
    : engineMode === 'router' ? 'ArrowRouter' : 'ArrowSwap Engine';
  const explorerTx = isMainnet ? mainnetExplorerTx : EXPLORER_TX;
  const explorerAddr = isMainnet ? mainnetExplorerAddr : EXPLORER_ADDR;
  // cirBTC has 8 decimals — show more precision than the default 4 (mainnet only).
  const balDigits = (sym) => (isMainnet && sym === 'cirBTC' ? 8 : 4);
  const feePctLabel = feeBps != null ? `${(feeBps / 100).toFixed(2)}%` : '—';

  const filteredTokens = useMemo(() => {
    if (!pickerQuery.trim()) return tokenList;
    const q = pickerQuery.trim().toLowerCase();
    return tokenList.filter((t) => t.symbol.toLowerCase().includes(q) || t.name?.toLowerCase().includes(q));
  }, [pickerQuery, tokenList]);

  const effectiveSlippage = customSlippage !== '' ? parseFloat(customSlippage) || 0 : slippage;
  const slipBps = Math.min(Math.max(Math.round((effectiveSlippage || 0) * 100), 0), 5000);

  // Switching network resets the form and clears anything from the other network.
  useEffect(() => {
    setPayToken('USDC');
    setReceiveToken('EURC');
    setPayAmount('');
    setReceiveAmount('0.00');
    setPickerOpen(null);
    setPickerQuery('');
    setPoolState(null);
    setMainnetBalances(null);
    setRoute(null);
    setUniQuote(null);
    setUniError(null);
    setError(null);
  }, [isMainnet]);

  const refresh = useCallback(async (opts = {}) => {
    const silent = !!opts.silent;

    // Mainnet: only balances are needed here — quotes are handled separately.
    if (isMainnet) {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const bals = await getMainnetBalances(address);
        setMainnetBalances(bals.formatted);
        setPoolUpdatedAt(Date.now());
      } catch (err) {
        console.error(err);
        if (!silent) {
          setError(
            isRateLimitError(err)
              ? 'The RPC endpoint is rate-limiting requests right now. Try Refresh again in a moment.'
              : err.message || 'Failed to load balances.'
          );
        }
      }
      if (!silent) setLoading(false);
      refreshingRef.current = false;
      return;
    }

    if (!pool) {
      setPoolState(null);
      setError(null);
      return;
    }
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    if (!silent) setLoading(true);
    setError(null);

    const maxAttempts = 4;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const state = await getPoolState(pool, address);
        setPoolState(state);
        setPoolUpdatedAt(Date.now());
        setError(null);
        break;
      } catch (err) {
        attempt += 1;
        const rateLimited = isRateLimitError(err);

        if (rateLimited && attempt < maxAttempts) {
          await sleep(500 * 2 ** (attempt - 1));
          continue;
        }

        console.error(err);
        if (!silent) {
          setError(
            rateLimited
              ? 'The RPC endpoint is rate-limiting requests right now. Retrying shortly — you can also hit Refresh again in a moment.'
              : err.message || 'Failed to load pool data.'
          );
        }
        break;
      }
    }

    if (!silent) setLoading(false);
    refreshingRef.current = false;
  }, [address, pool, isMainnet]);

  // Refetch whenever the wallet OR the selected pair (and therefore pool) changes.
  useEffect(() => { refresh(); }, [refresh]);

  // Quiet background auto-refresh so the rate ticker stays live, Uniswap-style.
  useEffect(() => {
    if (!pool && !isMainnet) return;
    const id = setInterval(() => refresh({ silent: true }), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [pool, isMainnet, refresh]);

  // Re-quote whenever the pay amount, pair, or pool reserves change (direct mode).
  useEffect(() => {
    if (engineMode !== 'direct' || isMainnet) return;
    let cancelled = false;

    async function runQuote() {
      if (!pool || !poolState || !payAmount || parseFloat(payAmount) <= 0) {
        setReceiveAmount('0.00');
        return;
      }
      setQuoting(true);
      try {
        const out = await quoteSwap(payToken, receiveToken, payAmount, poolState);
        if (!cancelled) setReceiveAmount(parseFloat(out).toFixed(out < 1 ? 4 : 2));
      } catch (err) {
        console.error('Quote failed:', err);
        if (!cancelled) setReceiveAmount('0.00');
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }

    runQuote();
    return () => { cancelled = true; };
  }, [engineMode, isMainnet, payAmount, payToken, receiveToken, pool, poolState]);

  // Re-quote via ArrowRouter whenever amount/pair changes (router mode), debounced.
  useEffect(() => {
    if (engineMode !== 'router' || isMainnet) return;

    if (!payAmount || parseFloat(payAmount) <= 0 || !payTokenData?.address || !receiveTokenData?.address) {
      setRoute(null);
      setReceiveAmount('0.00');
      return;
    }

    const thisRequest = ++routeRequestId.current;
    setRouteLoading(true);

    const timer = setTimeout(async () => {
      try {
        const result = await getBestRoute({
          tokenInAddress: payTokenData.address,
          tokenOutAddress: receiveTokenData.address,
          decimalsIn: payTokenData.decimals,
          decimalsOut: receiveTokenData.decimals,
          amountIn: payAmount,
        });
        if (routeRequestId.current !== thisRequest) return; // stale response, ignore
        setRoute(result);
        setReceiveAmount(result.path.length > 0 ? parseFloat(result.amountOut).toFixed(result.amountOut < 1 ? 4 : 2) : '0.00');
      } catch (err) {
        console.error('Router quote failed:', err);
        if (routeRequestId.current === thisRequest) {
          setRoute(null);
          setReceiveAmount('0.00');
        }
      } finally {
        if (routeRequestId.current === thisRequest) setRouteLoading(false);
      }
    }, ROUTER_QUOTE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [engineMode, isMainnet, payAmount, payTokenData, receiveTokenData]);

  // Independent 1-unit quote that powers the "1 USDC = 0.998 EURC" ticker,
  // so it stays live even before the user has typed an amount. Direct-mode only.
  useEffect(() => {
    let cancelled = false;
    async function runRate() {
      if (engineMode !== 'direct' || !pool || !poolState) { setUnitRate(null); return; }
      try {
        const out = await quoteSwap(payToken, receiveToken, '1', poolState);
        if (!cancelled) setUnitRate(parseFloat(out));
      } catch {
        if (!cancelled) setUnitRate(null);
      }
    }
    runRate();
    return () => { cancelled = true; };
  }, [engineMode, pool, poolState, payToken, receiveToken]);

  // ── Mainnet: read the ArrowDEX fee straight from the fee router contract,
  // so the fee shown in the UI can never drift from what the contract charges.
  useEffect(() => {
    if (!isMainnet) return;
    let cancelled = false;
    setFeeError(false);
    readFeeBps()
      .then((v) => { if (!cancelled) setFeeBps(v); })
      .catch((err) => {
        console.error('Fee router read failed:', err);
        if (!cancelled) { setFeeBps(null); setFeeError(true); }
      });
    return () => { cancelled = true; };
  }, [isMainnet]);

  // ── Mainnet: quote through ArrowRoute (KyberSwap's aggregator) on the amount left AFTER the ArrowDEX fee.
  useEffect(() => {
    if (!isMainnet) return;

    const grossRaw = payTokenData ? parseAmount(payAmount, payTokenData.decimals) : null;
    if (grossRaw == null || !receiveTokenData || feeBps == null) {
      setUniQuote(null);
      setUniError(null);
      setUniLoading(false);
      setReceiveAmount('0.00');
      return;
    }

    const thisRequest = ++uniRequestId.current;
    setUniLoading(true);
    setUniError(null);

    const timer = setTimeout(async () => {
      try {
        const { net } = splitFee(grossRaw, feeBps);
        const q = await getUniQuote({ tokenIn: payTokenData, tokenOut: receiveTokenData, amountInRaw: net });
        if (uniRequestId.current !== thisRequest) return; // stale response, ignore
        setUniQuote(q);
        if (q) {
          const v = parseFloat(q.amountOut);
          setReceiveAmount(receiveTokenData.decimals === 8 ? v.toFixed(8) : v.toFixed(v < 1 ? 4 : 2));
        } else {
          setReceiveAmount('0.00');
        }
      } catch (err) {
        console.error('ArrowRoute quote failed:', err);
        if (uniRequestId.current === thisRequest) {
          setUniQuote(null);
          setReceiveAmount('0.00');
          setUniError(
            isRateLimitError(err)
              ? 'The RPC endpoint is rate-limiting requests right now. Try again in a moment.'
              : err.shortMessage || err.message || 'Could not get a quote from ArrowRoute.'
          );
        }
      } finally {
        if (uniRequestId.current === thisRequest) setUniLoading(false);
      }
    }, ROUTER_QUOTE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isMainnet, payAmount, payTokenData, receiveTokenData, feeBps]);

  // Reset the "I understand the risk" ack whenever the trade shape changes.
  useEffect(() => { setImpactAck(false); }, [payAmount, payToken, receiveToken, engineMode]);

  const directPriceImpactPct = payAmount && parseFloat(payAmount) > 0 && poolState
    ? (() => {
        const reserveIn = parseFloat(poolState.reservesFormatted[payToken]);
        if (!reserveIn) return null;
        return (parseFloat(payAmount) / reserveIn) * 100;
      })()
    : null;

  // Unified price impact number regardless of mode, so the rest of the UI
  // (color coding, the confirmation gate) doesn't need to branch everywhere.
  const priceImpactPct = isMainnet
    ? (uniQuote?.priceImpactPct ?? null)
    : engineMode === 'router'
      ? (route?.priceImpactBps != null ? Number(route.priceImpactBps) / 100 : null)
      : directPriceImpactPct;

  const impactTone = priceImpactPct == null
    ? 'text-dim'
    : priceImpactPct >= IMPACT_BLOCK
      ? 'text-danger'
      : priceImpactPct >= IMPACT_DANGER
        ? 'text-amber-400'
        : priceImpactPct >= IMPACT_WARN
          ? 'text-yellow-400'
          : 'text-success';

  const needsImpactAck = priceImpactPct != null && priceImpactPct >= IMPACT_BLOCK;
  const minimumReceived = isMainnet
    ? (uniQuote
        ? parseFloat(formatRaw((uniQuote.amountOutRaw * BigInt(10000 - slipBps)) / 10000n, receiveTokenData.decimals))
        : 0)
    : (parseFloat(receiveAmount) > 0
        ? (parseFloat(receiveAmount) * (1 - effectiveSlippage / 100))
        : 0);

  // Mainnet: what the user pays in fees, and whether they can afford the trade.
  const grossRawMainnet = isMainnet && payTokenData ? parseAmount(payAmount, payTokenData.decimals) : null;
  const feeRawMainnet = grossRawMainnet != null && feeBps != null ? splitFee(grossRawMainnet, feeBps).fee : null;
  const insufficient = isMainnet
    && grossRawMainnet != null
    && payBalance != null
    && grossRawMainnet > (parseAmount(payBalance, payTokenData.decimals) ?? 0n);

  // Rate ticker value: amount of `receiveToken` per 1 `payToken` (null = nothing to show yet).
  const grossNum = parseFloat(payAmount);
  const tickerRate = isMainnet
    ? (uniQuote && grossNum > 0 ? parseFloat(uniQuote.amountOut) / grossNum : null)
    : engineMode === 'router'
      ? (route?.amountOut && grossNum > 0 ? parseFloat(route.amountOut) / grossNum : null)
      : unitRate;

  function flipTokens() {
    const p = payToken;
    setPayToken(receiveToken);
    setReceiveToken(p);
    setPayAmount('');
  }

  function selectToken(symbol) {
    const token = tokenList.find((t) => t.symbol === symbol);
    if (token?.disabled) return;

    if (pickerOpen === 'pay') {
      if (symbol === receiveToken) flipTokens();
      else setPayToken(symbol);
    } else if (pickerOpen === 'receive') {
      if (symbol === payToken) flipTokens();
      else setReceiveToken(symbol);
    }
    setPickerOpen(null);
    setPickerQuery('');
    setPayAmount('');
  }

  function setPercent(pct) {
    if (!payBalance) return;
    if (isMainnet) {
      // Leaves a small USDC reserve for gas (USDC is Arc's gas token).
      const v = computeSpendable(payBalance, payTokenData, pct);
      setPayAmount(v === '0' ? '' : v);
      return;
    }
    const amt = parseFloat(payBalance) * pct;
    setPayAmount(pct === 1 ? payBalance : amt.toFixed(6));
  }

  async function copyAddress() {
    if (!engineAddress) return;
    try {
      await navigator.clipboard.writeText(engineAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — silently ignore */ }
  }

  async function handleReviewSwap() {
    // ── Mainnet: ArrowRoute (KyberSwap aggregator) via the ArrowDEX fee router ──
    if (isMainnet) {
      if (!uniQuote || feeBps == null || insufficient) return;
      if (needsImpactAck && !impactAck) return;

      setModalOpen(true);
      setModalStep(0);
      setModalDone(false);
      setModalError(null);
      setTxHash(null);

      try {
        const amountInRaw = parseAmount(payAmount, payTokenData.decimals);
        if (amountInRaw == null) throw new Error('Enter a valid amount.');
        // Slippage applied to the quote of the amount left after the ArrowDEX fee.
        const minAmountOutRaw = (uniQuote.amountOutRaw * BigInt(10000 - slipBps)) / 10000n;

        setModalStep(1);
        const hash = await executeUniSwap({
          account: address,
          tokenIn: payTokenData,
          tokenOut: receiveTokenData,
          amountInRaw,
          minAmountOutRaw,
          route: uniQuote,
          onStatus: setModalStatus,
        });

        setTxHash(hash);
        // No txHash passed on purpose: the shared notification may build testnet explorer links.
        notify({
          type: 'swap',
          title: `Swapped ${payAmount} ${payToken} → ${receiveAmount} ${receiveToken}`,
          message: `Filled via ArrowRoute · ${feePctLabel} ArrowDEX fee`,
        });
        setModalStep(2);
        setModalDone(true);
        setPayAmount('');
        setUniQuote(null);
        refresh();
      } catch (err) {
        console.error(err);
        setModalError(err.shortMessage || err.message || 'Swap failed.');
      }
      return;
    }

    if (engineMode === 'direct' && !pool) return;
    if (engineMode === 'router' && (!route || route.path.length === 0)) return;
    if (needsImpactAck && !impactAck) return;

    setModalOpen(true);
    setModalStep(0);
    setModalDone(false);
    setModalError(null);
    setTxHash(null);

    try {
      let hash;

      if (engineMode === 'router') {
        // minAmountOut in raw token units, slippage applied to the router's own quote.
        const minAmountOutRaw = BigInt(
          Math.floor(Number(route.amountOutRaw) * (1 - effectiveSlippage / 100))
        );
        setModalStep(1);
        hash = await executeRouterSwap({
          account: address,
          tokenInAddress: payTokenData.address,
          tokenOutAddress: receiveTokenData.address,
          decimalsIn: payTokenData.decimals,
          amountIn: payAmount,
          minAmountOutRaw,
          onStatus: setModalStatus,
        });
      } else {
        const minAmountOut = minimumReceived.toFixed(18);
        setModalStep(1);
        hash = await executeSwap({
          account: address,
          pool,
          payTokenSymbol: payToken,
          receiveTokenSymbol: receiveToken,
          amountIn: payAmount,
          minAmountOut,
          onStatus: setModalStatus,
        });
      }

      setTxHash(hash);
      notify({
        type: 'swap',
        title: `Swapped ${payAmount} ${payToken} → ${receiveAmount} ${receiveToken}`,
        message: engineMode === 'router' ? 'Filled via ArrowRouter — best price' : 'Filled via ArrowSwap Engine',
        txHash: hash,
      });
      setModalStep(2);
      setModalDone(true);
      setPayAmount('');
      setRoute(null);
      refresh();
    } catch (err) {
      console.error(err);
      setModalError(err.shortMessage || err.message || 'Swap failed.');
    }
  }

  const canSwap = isMainnet
    ? (uniQuote && grossNum > 0 && !uniLoading && feeBps != null && !insufficient
        && parseFloat(receiveAmount) > 0 && !(needsImpactAck && !impactAck))
    : engineMode === 'router'
      ? (route && route.path.length > 0 && payAmount && parseFloat(payAmount) > 0 && !routeLoading
          && parseFloat(receiveAmount) > 0 && !(needsImpactAck && !impactAck))
      : (pool && payAmount && parseFloat(payAmount) > 0 && !quoting
          && parseFloat(receiveAmount) > 0 && !(needsImpactAck && !impactAck));

  return (
    <AppShell>
      <div className="max-w-[520px] mx-auto">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div className="card-label mb-2 tracking-[0.16em]">Exchange</div>
            <h1 className="text-[30px] font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-ivory via-ivory to-violetglow/90">
              Swap Assets
            </h1>
            <p className="text-dim text-[13px] mt-1.5">
              {isMainnet ? 'Live swaps on Arc Mainnet, routed through ArrowRoute.' : 'Real swaps on Arc Testnet.'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <NetworkModeToggle mode={isMainnet ? 'mainnet' : 'testnet'} onChange={setNetworkMode} mainnetReady={MAINNET_READY} />
            <button
              onClick={() => refresh()}
              disabled={loading}
              className="text-[11.5px] text-indigo-bright font-semibold disabled:opacity-40 hover:text-violetglow transition-colors"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Mainnet notice — real funds */}
        {isMainnet && (
          <div className="mb-4 text-[12px] text-amber-400 bg-amber-400/[0.06] border border-amber-400/20 rounded-[12px] px-3.5 py-2.5">
            Arc Mainnet — swaps use real funds. ArrowRoute compares Aero, Uniswap and other Arc DEXs for the best price; ArrowDEX adds a {feePctLabel} fee per swap.
          </div>
        )}

        {/* Engine mode toggle — ArrowSwap Engine (direct) vs ArrowRouter (best price). Testnet only. */}
        {!isMainnet && (
          <div className="mb-4">
            <RouteEngineToggle
              mode={engineMode}
              onModeChange={setEngineMode}
              route={route}
              loading={routeLoading}
              tokenInSymbol={payToken}
              tokenOutSymbol={receiveToken}
              knownSymbols={Object.fromEntries(TOKENS.filter((t) => t.address).map((t) => [t.address.toLowerCase(), t.symbol]))}
            />
          </div>
        )}

        {/* Contract badge — the "not just an address" ask. Testnet: direct mode. Mainnet: the ArrowDEX fee router. */}
        {(isMainnet || engineMode === 'direct') && (
          <div className="relative mb-4">
            <button
              onClick={() => setEngineOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 bg-white/[0.025] border border-white/[0.06] hover:border-indigo-bright/40 transition-all rounded-[16px] px-4 py-3 hover:bg-white/[0.035]"
            >
              <div className="flex items-center gap-3">
                <EngineLogo className="w-7 h-7" />
                <div className="text-left">
                  <div className="text-[13px] font-bold flex items-center gap-1.5 text-ivory">
                    {isMainnet ? 'Routed via ArrowRoute' : 'Routed via ArrowSwap Engine'}
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-indigo-bright">
                      <path fillRule="evenodd" d="M10 1.5l2.163 1.44 2.59-.2 1.02 2.393 2.393 1.02-.2 2.59L19.5 10l-1.44 2.163.2 2.59-2.393 1.02-1.02 2.393-2.59-.2L10 19.5l-2.163-1.44-2.59.2-1.02-2.393-2.393-1.02.2-2.59L.5 10l1.44-2.163-.2-2.59 2.393-1.02 1.02-2.393 2.59.2L10 1.5zm3.03 6.28a.75.75 0 00-1.06-1.06L8.5 10.19l-1.47-1.47a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l3.5-3.5z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-[11px] text-dim mt-0.5 tracking-wide">
                    {isMainnet ? `Best price across Arc DEXs · ${feePctLabel} ArrowDEX fee` : '0.30% fee pool · verified contract'}
                  </div>
                </div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 text-dim transition-transform duration-300 ${engineOpen ? 'rotate-180 text-indigo-bright' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
            </button>

            {engineOpen && (
              <div className="absolute z-20 mt-2 w-full bg-[#0A0A10]/95 backdrop-blur-xl border border-white/[0.08] rounded-[16px] p-4 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-3.5">
                  <EngineLogo className="w-10 h-10" />
                  <div>
                    <div className="text-sm font-bold text-ivory">{isMainnet ? 'ArrowDEX Fee Router' : 'ArrowSwap Engine'}</div>
                    <div className="text-[11px] text-dim">
                      {isMainnet ? 'Aggregates Aero, Uniswap & others · Arc Mainnet' : 'Automated market maker · Arc Testnet'}
                    </div>
                  </div>
                </div>
                <div className="text-[10.5px] text-dim mb-1.5 uppercase tracking-[0.14em] font-semibold">Contract address</div>
                <div className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-[12px] px-3.5 py-2.5">
                  <span className="font-mono text-[12px] text-ivory truncate flex-1 tracking-tight">
                    {engineAddress ? `${engineAddress.slice(0, 10)}…${engineAddress.slice(-8)}` : 'Unavailable for this pair'}
                  </span>
                  {engineAddress && (
                    <>
                      <button onClick={copyAddress} className="text-indigo-bright hover:text-violetglow text-[11px] font-semibold flex-shrink-0 transition-colors">
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                      <a href={explorerAddr(engineAddress)} target="_blank" rel="noreferrer" className="text-indigo-bright hover:text-violetglow text-[11px] font-semibold flex-shrink-0 transition-colors">
                        View ↗
                      </a>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 text-[13px] text-danger bg-danger/[0.06] border border-danger/20 rounded-[12px] px-3.5 py-2.5">
            {error}
          </div>
        )}
        {isMainnet && feeError && (
          <div className="mb-4 text-[13px] text-danger bg-danger/[0.06] border border-danger/20 rounded-[12px] px-3.5 py-2.5">
            Couldn't reach the ArrowDEX fee router on Arc Mainnet. Swaps are paused.
          </div>
        )}
        {isMainnet && uniError && (
          <div className="mb-4 text-[13px] text-danger bg-danger/[0.06] border border-danger/20 rounded-[12px] px-3.5 py-2.5">
            {uniError}
          </div>
        )}
        {!isMainnet && engineMode === 'direct' && !pool && (
          <div className="mb-4 text-sm text-dim">
            There's no direct pool for {payToken} → {receiveToken} yet.
          </div>
        )}
        {!isMainnet && engineMode === 'router' && !routeLoading && route && route.path.length === 0 && payAmount && (
          <div className="mb-4 text-sm text-dim">
            ArrowRouter couldn't find a route for {payToken} → {receiveToken} yet.
          </div>
        )}
        {isMainnet && !uniLoading && !uniError && !uniQuote && feeBps != null && grossNum > 0 && (
          <div className="mb-4 text-sm text-dim">
            ArrowRoute has no route for {payToken} → {receiveToken} at this size yet.
          </div>
        )}

        {/* ── Hero swap card ──────────────────────────────────────── */}
        <div className="relative">
          {/* Ambient glow — slow, quiet, sits behind the card only */}
          <div
            className="absolute -inset-6 rounded-[32px] opacity-60 blur-2xl pointer-events-none motion-safe:animate-arrow-drift"
            style={{
              background: 'conic-gradient(from 180deg, rgba(108,99,255,0.22), rgba(77,138,255,0.16), rgba(185,140,255,0.22), rgba(108,99,255,0.22))',
            }}
          />

          <div className="relative rounded-card bg-panel/90 backdrop-blur-xl border border-white/[0.06] shadow-[0_25px_70px_-20px_rgba(0,0,0,0.75)] overflow-hidden">
            {/* Hairline — the signature edge-light */}
            <div className="h-[2px] w-full bg-gradient-to-r from-indigo via-laser to-violetglow" />

            <div className="p-7">
              {/* Live rate ticker */}
              <div className="flex items-center justify-between mb-4 px-0.5">
                <button
                  onClick={() => setRateFlipped((v) => !v)}
                  className="flex items-center gap-1.5 text-[12px] text-dim hover:text-ivory transition-colors bg-white/[0.03] hover:bg-white/[0.05] rounded-full px-3 py-1.5 border border-white/5"
                  disabled={tickerRate == null}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_theme(colors.success)] animate-pulse" />
                  {tickerRate == null ? (
                    !isMainnet && engineMode === 'direct' ? 'Fetching live rate…' : 'Enter an amount to see the routed rate…'
                  ) : rateFlipped ? (
                    <>1 {receiveToken} = {fmt(1 / tickerRate, 6)} {payToken}</>
                  ) : (
                    <>1 {payToken} = {fmt(tickerRate, 6)} {receiveToken}</>
                  )}
                  {tickerRate != null && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 opacity-60"><path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" /></svg>
                  )}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] text-dim/60 font-mono">{poolUpdatedAt ? `updated ${timeAgo(poolUpdatedAt)}` : ''}</span>
                  <div className="relative">
                    <button
                      onClick={() => setSettingsOpen((v) => !v)}
                      className="w-8 h-8 rounded-full bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-indigo-bright/30 flex items-center justify-center text-dim hover:text-indigo-bright transition-all"
                      aria-label="Swap settings"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                        <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
                      </svg>
                    </button>
                    {settingsOpen && (
                      <div className="absolute right-0 z-20 mt-2 w-64 bg-[#0A0A10]/95 backdrop-blur-xl border border-white/[0.08] rounded-[16px] p-4 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]">
                        <div className="text-[12px] font-bold mb-3 text-ivory">Slippage tolerance</div>
                        <div className="flex gap-1.5 mb-2.5">
                          {[0.1, 0.5, 1.0].map((s) => (
                            <button
                              key={s}
                              onClick={() => { setSlippage(s); setCustomSlippage(''); }}
                              className={`flex-1 px-2 py-1.5 rounded-lg font-mono text-[11px] transition-all ${slippage === s && customSlippage === '' ? 'bg-gradient-to-br from-indigo to-indigo-bright text-white shadow-[0_4px_14px_-4px_rgba(108,99,255,0.6)]' : 'bg-white/[0.03] text-dim hover:bg-white/[0.06]'}`}
                            >
                              {s}%
                            </button>
                          ))}
                          <div className="flex-1 flex items-center bg-white/[0.03] rounded-lg px-2 border border-white/5">
                            <input
                              value={customSlippage}
                              onChange={(e) => setCustomSlippage(e.target.value.replace(/[^0-9.]/g, ''))}
                              placeholder="Custom"
                              className="w-full bg-transparent text-[11px] font-mono outline-none placeholder:text-dim/50"
                            />
                            <span className="text-[11px] text-dim">%</span>
                          </div>
                        </div>
                        {effectiveSlippage > 5 && (
                          <div className="text-[10.5px] text-amber-400">High slippage — your trade may be frontrun.</div>
                        )}
                        {effectiveSlippage > 0 && effectiveSlippage < 0.1 && (
                          <div className="text-[10.5px] text-amber-400">Very low slippage — the swap may fail to fill.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* PAY */}
              <div className="bg-black/30 border border-white/[0.06] rounded-[18px] p-5 focus-within:border-indigo-bright/40 transition-colors">
                <div className="flex justify-between text-[11px] text-dim mb-3 tracking-wide">
                  <span>You pay</span>
                  <span className="flex items-center gap-2">
                    Balance: <span className="font-mono text-ivory/70">{payBalance ? fmt(payBalance, balDigits(payToken)) : '—'}</span>
                    <span className="flex gap-1">
                      {[0.25, 0.5, 0.75].map((p) => (
                        <button key={p} onClick={() => setPercent(p)} className="text-indigo-bright/80 hover:text-violetglow font-semibold transition-colors">
                          {p * 100}%
                        </button>
                      ))}
                      <button className="text-indigo-bright hover:text-violetglow font-semibold transition-colors" onClick={() => setPercent(1)}>MAX</button>
                    </span>
                  </span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <button
                    onClick={() => setPickerOpen(pickerOpen === 'pay' ? null : 'pay')}
                    className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-indigo-bright/30 transition-all rounded-full px-3.5 py-2 text-[14px] font-bold flex-shrink-0"
                  >
                    <TokenIcon token={payTokenData} className="w-6 h-6 rounded-full" />
                    {payToken}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 opacity-60"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0.00"
                    className="bg-transparent text-right font-mono text-[28px] tracking-tight tabular-nums outline-none w-full text-ivory placeholder:text-dim/30"
                  />
                </div>
                {pickerOpen === 'pay' && (
                  <TokenPicker
                    tokens={filteredTokens}
                    onSelect={selectToken}
                    query={pickerQuery}
                    setQuery={setPickerQuery}
                    poolState={isMainnet ? { balancesFormatted: mainnetBalances } : poolState}
                    digitsFor={balDigits}
                  />
                )}
              </div>

              {/* SWAP ARROW */}
              <div className="flex justify-center -my-[19px] relative z-10">
                <button
                  onClick={flipTokens}
                  className="w-11 h-11 rounded-[14px] bg-panel border border-white/10 flex items-center justify-center text-dim hover:text-white hover:border-transparent hover:bg-gradient-to-br hover:from-indigo hover:to-violetglow transition-all duration-300 hover:rotate-180 hover:shadow-[0_8px_24px_-6px_rgba(108,99,255,0.7)]"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" /></svg>
                </button>
              </div>

              {/* RECEIVE */}
              <div className="bg-black/30 border border-white/[0.06] rounded-[18px] p-5">
                <div className="flex justify-between text-[11px] text-dim mb-3 tracking-wide">
                  <span>You receive</span>
                  <span>Balance: <span className="font-mono text-ivory/70">{receiveBalance ? fmt(receiveBalance, balDigits(receiveToken)) : '—'}</span></span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <button
                    onClick={() => setPickerOpen(pickerOpen === 'receive' ? null : 'receive')}
                    className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-indigo-bright/30 transition-all rounded-full px-3.5 py-2 text-[14px] font-bold flex-shrink-0"
                  >
                    <TokenIcon token={receiveTokenData} className="w-6 h-6 rounded-full" />
                    {receiveToken}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 opacity-60"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  <div className="font-mono text-[28px] tracking-tight tabular-nums text-ivory">
                    {(isMainnet ? uniLoading : engineMode === 'direct' ? quoting : routeLoading) ? (
                      <span className="text-dim animate-pulse">…</span>
                    ) : receiveAmount}
                  </div>
                </div>
                {pickerOpen === 'receive' && (
                  <TokenPicker
                    tokens={filteredTokens}
                    onSelect={selectToken}
                    query={pickerQuery}
                    setQuery={setPickerQuery}
                    poolState={isMainnet ? { balancesFormatted: mainnetBalances } : poolState}
                    digitsFor={balDigits}
                  />
                )}
              </div>

              {/* DETAILS */}
              <div className="mt-5 space-y-2.5 bg-white/[0.015] rounded-[14px] p-4 border border-white/[0.04]">
                <div className="flex justify-between text-[11.5px] text-dim">
                  <span>Route</span>
                  <span className="font-mono text-ivory/80">
                    {isMainnet && uniQuote ? uniQuote.symbols.join(' → ') : `${payToken} → ${receiveToken}`} · {engineName}
                  </span>
                </div>
                <div className="flex justify-between text-[11.5px] text-dim">
                  <span>Price impact</span>
                  <span className={`font-mono tabular-nums ${impactTone}`}>{priceImpactPct == null ? '—' : `${priceImpactPct.toFixed(2)}%`}</span>
                </div>
                <div className="flex justify-between text-[11.5px] text-dim">
                  <span>Minimum received</span>
                  <span className="font-mono tabular-nums text-ivory/80">{minimumReceived > 0 ? `${fmt(minimumReceived, balDigits(receiveToken))} ${receiveToken}` : '—'}</span>
                </div>
                <div className="flex justify-between text-[11.5px] text-dim">
                  <span>Slippage tolerance</span>
                  <span className="font-mono tabular-nums text-ivory/80">{effectiveSlippage}%</span>
                </div>
                {isMainnet && (
                  <div className="flex justify-between text-[11.5px] text-dim">
                    <span>ArrowDEX fee ({feePctLabel})</span>
                    <span className="font-mono tabular-nums text-ivory/80">
                      {feeRawMainnet != null && feeRawMainnet > 0n
                        ? `${fmt(formatRaw(feeRawMainnet, payTokenData.decimals), 6)} ${payToken}`
                        : '—'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-[11.5px] text-dim">
                  <span>Pool fee</span>
                  <span className="font-mono tabular-nums">
                    {isMainnet
                      ? (uniQuote?.poolFeePct != null ? `${uniQuote.poolFeePct.toFixed(3)}%` : '—')
                      : '0.30%'}
                  </span>
                </div>
                {!isMainnet && engineMode === 'direct' && poolState && (
                  <div className="flex justify-between text-[11.5px] text-dim">
                    <span>Pool liquidity</span>
                    <span className="font-mono tabular-nums text-ivory/80">
                      {fmt(poolState.reservesFormatted?.[payToken], 0)} {payToken} / {fmt(poolState.reservesFormatted?.[receiveToken], 0)} {receiveToken}
                    </span>
                  </div>
                )}
              </div>

              {needsImpactAck && (
                <label className="mt-4 flex items-start gap-2.5 bg-danger/[0.08] border border-danger/25 rounded-[14px] p-3.5 text-[12px] text-danger cursor-pointer">
                  <input
                    type="checkbox"
                    checked={impactAck}
                    onChange={(e) => setImpactAck(e.target.checked)}
                    className="mt-0.5 accent-danger"
                  />
                  <span>
                    This trade moves the price by {priceImpactPct?.toFixed(2)}% — well above normal. Confirm you understand
                    the impact before continuing.
                  </span>
                </label>
              )}

              {!isConnected ? (
                <button
                  onClick={connect}
                  className="group relative w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[16px] shadow-[0_14px_36px_-10px_rgba(108,99,255,0.75)] hover:-translate-y-[1px] hover:shadow-[0_18px_44px_-8px_rgba(139,127,255,0.85)] transition-all overflow-hidden"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <span className="relative">Connect Wallet</span>
                </button>
              ) : (
                <button
                  onClick={handleReviewSwap}
                  disabled={!canSwap}
                  className="group relative w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[16px] shadow-[0_14px_36px_-10px_rgba(108,99,255,0.75)] hover:-translate-y-[1px] hover:shadow-[0_18px_44px_-8px_rgba(139,127,255,0.85)] transition-all disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-[0_14px_36px_-10px_rgba(108,99,255,0.75)] disabled:cursor-not-allowed overflow-hidden"
                >
                  {canSwap && (
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  )}
                  <span className="relative">
                    {isMainnet && insufficient
                      ? 'Insufficient Balance'
                      : isMainnet && !uniLoading && !uniQuote && grossNum > 0 && feeBps != null
                        ? 'No Route Found'
                        : !isMainnet && engineMode === 'direct' && !pool
                          ? 'No Pool for This Pair'
                          : !isMainnet && engineMode === 'router' && (!route || route.path.length === 0) && payAmount
                            ? 'No Route Found'
                            : needsImpactAck && !impactAck
                              ? 'Confirm Price Impact Above'
                              : 'Review Swap'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} closeable={modalDone || !!modalError}>
        <div className="mb-6">
          <div className="card-label mb-2 tracking-[0.16em]">{modalDone ? 'Complete' : modalError ? 'Failed' : 'In Progress'}</div>
          <h2 className="text-xl font-bold text-ivory">
            {modalDone ? 'Swap Successful' : `Swapping ${payAmount} ${payToken}`}
          </h2>
          <p className="text-dim text-sm mt-1">
            {payToken} → {receiveToken} via {engineName}
          </p>
        </div>

        {!modalDone && !modalError && (
          <div className="space-y-3">
            {['Confirm in wallet', 'Submitting to Arc', 'Waiting for confirmation'].map((label, i) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                {i < modalStep ? (
                  <span className="w-4 h-4 rounded-full bg-success/20 text-success flex items-center justify-center text-[10px]">✓</span>
                ) : i === modalStep ? (
                  <span className="w-4 h-4 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin flex-shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-white/10 flex-shrink-0" />
                )}
                <span className={i <= modalStep ? 'text-ivory' : 'text-dim'}>{i === modalStep ? (modalStatus || label) : label}</span>
              </div>
            ))}
          </div>
        )}
        {modalDone && txHash && (
          <a href={explorerTx(txHash)} target="_blank" rel="noreferrer" className="text-indigo-bright hover:text-violetglow text-sm font-mono transition-colors">
            View transaction →
          </a>
        )}
        {modalError && (
          <div className="mt-1 text-[13px] text-danger bg-danger/10 border border-danger/25 rounded-[12px] p-3.5">
            {modalError}
          </div>
        )}
        {(modalDone || modalError) && (
          <button
            onClick={() => setModalOpen(false)}
            className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14px] py-3.5 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform"
          >
            {modalDone ? 'Done' : 'Close'}
          </button>
        )}
      </Modal>

      <style jsx global>{`
        @keyframes arrow-drift {
          0%   { transform: rotate(0deg) scale(1); }
          50%  { transform: rotate(180deg) scale(1.06); }
          100% { transform: rotate(360deg) scale(1); }
        }
        .animate-arrow-drift {
          animation: arrow-drift 22s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-arrow-drift { animation: none; }
        }
      `}</style>
    </AppShell>
  );
}

function TokenPicker({ tokens, onSelect, query, setQuery, poolState, digitsFor = () => 4 }) {
  return (
    <div className="mt-3 bg-black/50 border border-white/[0.08] rounded-[16px] overflow-hidden">
      <div className="p-2.5 border-b border-white/[0.06]">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search token"
          className="w-full bg-white/[0.04] rounded-[10px] px-3 py-2 text-[13px] outline-none placeholder:text-dim/50 border border-white/5 focus:border-indigo-bright/40 transition-colors"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {tokens.length === 0 && (
          <div className="px-4 py-6 text-center text-[12px] text-dim">No tokens match "{query}"</div>
        )}
        {tokens.map((t) => (
          <button
            key={t.symbol}
            onClick={() => onSelect(t.symbol)}
            disabled={t.disabled}
            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
              t.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/[0.05]'
            }`}
          >
            <TokenIcon token={t} className="w-8 h-8 rounded-full" />
            <div className="flex-1">
              <div className="text-sm font-bold flex items-center gap-2 text-ivory">
                {t.symbol}
                {t.disabled && <span className="text-[10px] font-semibold text-dim bg-white/5 px-1.5 py-0.5 rounded">Soon</span>}
              </div>
              <div className="text-[11px] text-dim">{t.name}</div>
            </div>
            {poolState?.balancesFormatted?.[t.symbol] != null && (
              <div className="text-[11px] text-dim font-mono tabular-nums">{fmt(poolState.balancesFormatted[t.symbol], digitsFor(t.symbol))}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}