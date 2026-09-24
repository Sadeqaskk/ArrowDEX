'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AppShell from '../../components/AppShell';
import Modal from '../../components/Modal';
import PremiumSelector from '../../components/PremiumSelector';
import FeeAddLiquidityPanel from '../../components/FeeAddLiquidityPanel';
import { useWallet } from '../../lib/WalletContext';
import {
  getPoolState, addLiquidity, removeLiquidity, wrapUsdc, unwrapUsdc,
  getEurcPoolState, addEurcLiquidity, removeEurcLiquidity,
} from '../../lib/pool';
import { POOL_CONFIG, EURC_POOL_CONFIG } from '../../lib/poolConfig';
import { MAINNET_POOLS_V4 as MAINNET_POOLS_V4_RAW } from '../../lib/uniV4PoolConfig';
import { getV4PoolState, removeV4Liquidity } from '../../lib/uniV4Pools';
import { getPoolDisplayPrice, formatPrice } from '../../lib/uniV4Price';
import { useNotify } from '../../components/NotificationProvider';


// Defensive: if the import ever resolves to undefined (stale build cache,
// missing env var crashing the sibling module at import time, etc.) fall
// back to an empty array instead of hard-crashing the whole page on `.map`.
const MAINNET_POOLS_V4 = Array.isArray(MAINNET_POOLS_V4_RAW) ? MAINNET_POOLS_V4_RAW : [];

const EXPLORER_TX = (hash) => `https://testnet.arcscan.app/tx/${hash}`;
const EXPLORER_ADDR = (addr) => `https://testnet.arcscan.app/address/${addr}`;
// TODO: point these at Arc Mainnet's real explorer once confirmed — reusing
// the testnet explorer here would produce dead links for mainnet tx/address views.
const MAINNET_EXPLORER_TX = (hash) => `https://arcscan.app/tx/${hash}`;
const MAINNET_EXPLORER_ADDR = (addr) => `https://arcscan.app/address/${addr}`;

const POOL_OPTIONS = [
  {
    key: 'wusdcArrow',
    label: 'WUSDC / ARROW',
    sublabel: 'Constant-product AMM · 0.30% fee',
    pair: [
      { symbol: 'W', logo: '/fonts/tokens/wusdc.png' },
      { symbol: 'A', logo: '/fonts/tokens/arrow.png' },
    ],
  },
  {
    key: 'wusdcEurc',
    label: 'WUSDC / EURC',
    sublabel: 'Constant-product AMM · 0.30% fee',
    pair: [
      { symbol: 'W', logo: '/fonts/tokens/wusdc.png' },
      { symbol: 'E', logo: '/fonts/tokens/eurc.png' },
    ],
  },
];

// Token logos for the mainnet pool picker (files live in public/fonts/tokens/).
const MAINNET_TOKEN_LOGOS = {
  USDC: '/fonts/tokens/usdc.png',
  EURC: '/fonts/tokens/eurc.png',
  cirBTC: '/fonts/tokens/cirBTC.png',
};

// Mainnet pool picker options, built from MAINNET_POOLS_V4 so the selector
// never drifts out of sync with the actual pool config.
const MAINNET_POOL_OPTIONS = MAINNET_POOLS_V4.map((p) => ({
  key: p.key,
  label: p.label,
  sublabel: 'Uniswap v4 · full-range',
  pair: [
    { symbol: p.currency0.symbol[0], logo: MAINNET_TOKEN_LOGOS[p.currency0.symbol] },
    { symbol: p.currency1.symbol[0], logo: MAINNET_TOKEN_LOGOS[p.currency1.symbol] },
  ],
}));

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

function EngineLogo({ className = 'w-6 h-6' }) {
  return (
    <span className={`${className} flex-shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-indigo-bright/20 to-indigo/20 ring-1 ring-indigo-bright/30 shadow-[0_0_12px_rgba(124,125,255,0.35)]`}>
      <img src="/fonts/tokens/arrow.png" alt="ArrowSwap Engine" className="w-full h-full object-cover" />
    </span>
  );
}

function LivePulse({ ok }) {
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? 'bg-success animate-pulse' : 'bg-dim/40'}`} />;
}

// Testnet ↔ Mainnet pill — Mainnet is now unlocked: v4 pool contracts are
// live on Arc Mainnet (see lib/uniV4PoolConfig.js).
function NetworkModeToggle({ mode, onChange }) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/5 bg-white/[0.02] p-0.5">
      {['testnet', 'mainnet'].map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-3 py-1 rounded-full text-[10.5px] font-mono font-semibold uppercase tracking-wide transition-colors ${
            mode === m ? 'bg-indigo/25 text-indigo-bright' : 'text-dim hover:text-ivory'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export default function PoolsPage() {
  const { address, isConnected, connect, networkMode, setNetworkMode } = useWallet();
  const notify = useNotify();

  const isMainnet = networkMode === 'mainnet' && MAINNET_POOLS_V4.length > 0;

  // ── Testnet pool selection (unchanged) ──────────────────────────────
  const [poolKey, setPoolKey] = useState('wusdcArrow');
  const isEurc = poolKey === 'wusdcEurc';
  const activePoolConfig = isEurc ? EURC_POOL_CONFIG : POOL_CONFIG;
  const tokenBSymbol = isEurc ? 'EURC' : 'ARROW';
  const tokenBDotColor = isEurc ? 'bg-[#F5C451]' : 'bg-[#8B7FFF]';

  // ── Mainnet v4 pool selection ────────────────────────────────────────
  const [v4PoolKey, setV4PoolKey] = useState(MAINNET_POOLS_V4[0]?.key || null);
  const activeV4Pool = MAINNET_POOLS_V4.find((p) => p.key === v4PoolKey) || MAINNET_POOLS_V4[0] || null;

  const [poolState, setPoolState] = useState(null);
  const [v4PoolState, setV4PoolState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const refreshingRef = useRef(false);

  const [tab, setTab] = useState('add');
  const [amountWusdc, setAmountWusdc] = useState('');
  const [amountArrow, setAmountArrow] = useState('');
  const [removeAmount, setRemoveAmount] = useState('');

  // Mainnet remove form state (add flow lives in FeeAddLiquidityPanel)
  const [v4RemoveTokenId, setV4RemoveTokenId] = useState('');
  const [v4RemoveTickLower, setV4RemoveTickLower] = useState('');
  const [v4RemoveTickUpper, setV4RemoveTickUpper] = useState('');
  const [v4RemoveLiquidity, setV4RemoveLiquidity] = useState('');
  const [v4RemovePct, setV4RemovePct] = useState(100);

  const [wrapTab, setWrapTab] = useState('wrap');
  const [wrapAmount, setWrapAmount] = useState('');
  const [unwrapAmount, setUnwrapAmount] = useState('');
  const [wrapModalOpen, setWrapModalOpen] = useState(false);
  const [wrapStep, setWrapStep] = useState(0);
  const [wrapStatus, setWrapStatus] = useState('');
  const [wrapError, setWrapError] = useState(null);
  const [wrapDone, setWrapDone] = useState(false);
  const [wrapTxHash, setWrapTxHash] = useState(null);

  const [engineOpen, setEngineOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(0);
  const [modalStatus, setModalStatus] = useState('');
  const [modalError, setModalError] = useState(null);
  const [modalDone, setModalDone] = useState(false);
  const [txHash, setTxHash] = useState(null);

  // ── Testnet refresh (unchanged) ──────────────────────────────────────
  const refresh = useCallback(async () => {
    if (isMainnet) return; // mainnet has its own refresh below
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    setLoading(true);
    setError(null);

    const maxAttempts = 4;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const state = isEurc ? await getEurcPoolState(address) : await getPoolState(address);
        setPoolState(state);
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
        setError(
          rateLimited
            ? 'The RPC endpoint is rate-limiting requests right now. Retrying shortly — you can also hit Refresh again in a moment.'
            : err.message || 'Failed to load pool data.'
        );
        break;
      }
    }

    setLoading(false);
    refreshingRef.current = false;
  }, [address, isEurc, isMainnet]);

  // ── Mainnet v4 refresh ────────────────────────────────────────────────
  const refreshV4 = useCallback(async () => {
    if (!isMainnet || !activeV4Pool) return;
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    setLoading(true);
    setError(null);
    try {
      const state = await getV4PoolState(activeV4Pool, address);
      setV4PoolState(state);
    } catch (err) {
      console.error(err);
      setError(
        isRateLimitError(err)
          ? 'The RPC endpoint is rate-limiting requests right now. Try Refresh again in a moment.'
          : err.message || 'Failed to load pool data. If this pool was just created, confirm fee/tickSpacing/hooks in lib/uniV4PoolConfig.js match the deployed pool.'
      );
    }
    setLoading(false);
    refreshingRef.current = false;
  }, [address, isMainnet, activeV4Pool]);

  useEffect(() => {
    if (isMainnet) refreshV4();
    else refresh();
  }, [isMainnet, refresh, refreshV4]);

  // Live price: re-read the selected mainnet pool every 15s while the tab is visible.
  useEffect(() => {
    if (!isMainnet) return undefined;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshV4();
    }, 15000);
    return () => clearInterval(id);
  }, [isMainnet, refreshV4]);

  // Reset in-flight amounts whenever the selected pool changes.
  useEffect(() => {
    setAmountWusdc('');
    setAmountArrow('');
    setRemoveAmount('');
    setPoolState(null);
  }, [poolKey]);

  useEffect(() => {
    setV4PoolState(null);
  }, [v4PoolKey, isMainnet]);

  const reserveWusdc = poolState ? parseFloat(poolState.reserveWusdc) : 0;
  const reserveArrow = poolState ? parseFloat(isEurc ? poolState.reserveEurc : poolState.reserveArrow) : 0;
  const totalSupply = poolState ? parseFloat(poolState.totalSupply) : 0;
  const lpBalance = poolState ? parseFloat(poolState.lpBalance) : 0;

  const price = poolState && reserveWusdc > 0 ? reserveArrow / reserveWusdc : null;
  const poolShare = poolState && totalSupply > 0 ? (lpBalance / totalSupply) * 100 : 0;
  const tvlWusdc = poolState ? reserveWusdc * 2 : null;
  const yourWusdcValue = poolState && totalSupply > 0 ? (lpBalance / totalSupply) * reserveWusdc : 0;
  const yourArrowValue = poolState && totalSupply > 0 ? (lpBalance / totalSupply) * reserveArrow : 0;

  const donutBackground = poolState && (reserveWusdc + reserveArrow) > 0
    ? (() => {
        const wusdcValuePct = tvlWusdc > 0 ? (reserveWusdc / tvlWusdc) * 100 : 50;
        return `conic-gradient(#5FE0A8 0% ${wusdcValuePct}%, ${isEurc ? '#F5C451' : '#8B7FFF'} ${wusdcValuePct}% 100%)`;
      })()
    : 'conic-gradient(rgba(255,255,255,0.06) 0% 100%)';

  function handleWusdcChange(val) {
    setAmountWusdc(val);
    if (price && val) setAmountArrow((parseFloat(val) * price).toFixed(6));
  }
  function handleArrowChange(val) {
    setAmountArrow(val);
    if (price && val) setAmountWusdc((parseFloat(val) / price).toFixed(6));
  }

  const estLpOut = useMemo(() => {
    const w = parseFloat(amountWusdc);
    const a = parseFloat(amountArrow);
    if (!poolState || !w || w <= 0 || !a || a <= 0) return null;
    if (totalSupply > 0 && reserveWusdc > 0) return (w / reserveWusdc) * totalSupply;
    return Math.sqrt(w * a);
  }, [amountWusdc, amountArrow, poolState, totalSupply, reserveWusdc]);

  const estRemoveOut = useMemo(() => {
    const r = parseFloat(removeAmount);
    if (!poolState || !r || r <= 0 || totalSupply <= 0) return null;
    const fraction = r / totalSupply;
    return { wusdc: fraction * reserveWusdc, arrow: fraction * reserveArrow };
  }, [removeAmount, poolState, totalSupply, reserveWusdc, reserveArrow]);

  // ── Mainnet derived values ───────────────────────────────────────────
  const v4Price = v4PoolState && v4PoolState.sqrtPriceX96 && activeV4Pool
    ? (Number(v4PoolState.sqrtPriceX96) / 2 ** 96) ** 2
      * 10 ** (activeV4Pool.currency0.decimals - activeV4Pool.currency1.decimals)
    : null;

  // Human price for whichever pool is selected (cirBTC/USDC, USDC/EURC,
  // cirBTC/EURC) — handles decimals and token order.
  const v4Display = v4PoolState && v4PoolState.sqrtPriceX96 && activeV4Pool
    ? getPoolDisplayPrice(v4PoolState.sqrtPriceX96, activeV4Pool)
    : null;

  async function copyAddress() {
    const addr = isMainnet ? activeV4Pool?.currency0.address : activePoolConfig.pool.address;
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — ignore */ }
  }

  async function handleAddLiquidity() {
    setModalOpen(true);
    setModalStep(0);
    setModalDone(false);
    setModalError(null);
    setTxHash(null);
    try {
      setModalStep(1);
      const hash = isEurc
        ? await addEurcLiquidity({ account: address, amountWusdc, amountEurc: amountArrow, onStatus: setModalStatus })
        : await addLiquidity({ account: address, amountWusdc, amountArrow, onStatus: setModalStatus });
      setTxHash(hash);
      notify({ type: 'addLiquidity', title: 'Added Liquidity', message: `${amountWusdc} WUSDC + ${amountArrow} ${tokenBSymbol} deposited`, txHash: hash });
      setModalStep(2);
      setModalDone(true);
      setAmountWusdc('');
      setAmountArrow('');
      refresh();
    } catch (err) {
      console.error(err);
      setModalError(err.shortMessage || err.message || 'Transaction failed.');
    }
  }

  async function handleRemoveLiquidity() {
    setModalOpen(true);
    setModalStep(0);
    setModalDone(false);
    setModalError(null);
    setTxHash(null);
    try {
      setModalStep(1);
      const hash = isEurc
        ? await removeEurcLiquidity({ account: address, lpAmount: removeAmount, onStatus: setModalStatus })
        : await removeLiquidity({ account: address, lpAmount: removeAmount, onStatus: setModalStatus });
      setTxHash(hash);
      notify({ type: 'removeLiquidity', title: 'Removed Liquidity', message: `${removeAmount} LP tokens withdrawn`, txHash: hash });
      setModalStep(2);
      setModalDone(true);
      setRemoveAmount('');
      refresh();
    } catch (err) {
      console.error(err);
      setModalError(err.shortMessage || err.message || 'Transaction failed.');
    }
  }

  async function handleRemoveV4Liquidity() {
    if (!activeV4Pool) return;
    if (!v4RemoveTokenId || !v4RemoveTickLower || !v4RemoveTickUpper || !v4RemoveLiquidity) {
      setError('Fill in Token ID, tick range, and liquidity for the position first — see the note under the form.');
      return;
    }
    setModalOpen(true);
    setModalStep(0);
    setModalDone(false);
    setModalError(null);
    setTxHash(null);
    try {
      setModalStep(1);
      const hash = await removeV4Liquidity({
        account: address,
        poolCfg: activeV4Pool,
        tokenId: v4RemoveTokenId,
        positionSnapshot: {
          tickLower: parseInt(v4RemoveTickLower, 10),
          tickUpper: parseInt(v4RemoveTickUpper, 10),
          liquidity: v4RemoveLiquidity,
        },
        liquidityPercentBps: Math.round(v4RemovePct * 100),
        onStatus: setModalStatus,
      });
      setTxHash(hash);
      notify({ type: 'removeLiquidity', title: 'Removed Liquidity', message: `Position #${v4RemoveTokenId} — ${v4RemovePct}% withdrawn`, txHash: hash });
      setModalStep(2);
      setModalDone(true);
      setV4RemoveTokenId('');
      setV4RemoveTickLower('');
      setV4RemoveTickUpper('');
      setV4RemoveLiquidity('');
      refreshV4();
    } catch (err) {
      console.error(err);
      setModalError(err.shortMessage || err.message || 'Transaction failed.');
    }
  }

  async function handleWrapUsdc() {
    setWrapModalOpen(true);
    setWrapStep(0);
    setWrapDone(false);
    setWrapError(null);
    setWrapTxHash(null);
    try {
      setWrapStep(1);
      const hash = await wrapUsdc({ account: address, amount: wrapAmount, onStatus: setWrapStatus });
      setWrapTxHash(hash);
      notify({ type: 'wrap', title: `Wrapped ${wrapAmount} USDC`, message: 'Converted to WUSDC 1:1', txHash: hash });
      setWrapStep(2);
      setWrapDone(true);
      setWrapAmount('');
      refresh();
    } catch (err) {
      console.error(err);
      setWrapError(err.shortMessage || err.message || 'Wrap failed.');
    }
  }

  async function handleUnwrapUsdc() {
    setWrapModalOpen(true);
    setWrapStep(0);
    setWrapDone(false);
    setWrapError(null);
    setWrapTxHash(null);
    try {
      setWrapStep(1);
      const hash = await unwrapUsdc({ account: address, amount: unwrapAmount, onStatus: setWrapStatus });
      setWrapTxHash(hash);
      notify({ type: 'unwrap', title: `Unwrapped ${unwrapAmount} WUSDC`, message: 'Converted back to USDC 1:1', txHash: hash });
      setWrapStep(2);
      setWrapDone(true);
      setUnwrapAmount('');
      refresh();
    } catch (err) {
      console.error(err);
      setWrapError(err.shortMessage || err.message || 'Unwrap failed.');
    }
  }

  const wusdcBalance = poolState ? poolState.wusdcBalance : null;
  const tokenBBalance = poolState ? (isEurc ? poolState.eurcBalance : poolState.arrowBalance) : null;

  return (
    <AppShell>
      <div className="max-w-[620px] mx-auto">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="card-label mb-2 flex items-center gap-1.5"><LivePulse ok={!error} /> Liquidity</div>
            <h1 className="text-2xl sm:text-[28px] font-bold">
              {isMainnet ? (activeV4Pool?.label || 'Mainnet') : `WUSDC / ${tokenBSymbol}`} Pool
            </h1>
            <p className="text-dim text-sm mt-1.5">
              {isMainnet
                ? 'A real Uniswap v4 pool on Arc Mainnet. Full-range liquidity for now — real funds.'
                : 'A real constant-product AMM on Arc Testnet. Deposit both tokens to earn 0.30% of every trade.'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <NetworkModeToggle mode={networkMode} onChange={setNetworkMode} />
            <button onClick={() => (isMainnet ? refreshV4() : refresh())} disabled={loading} className="text-xs text-indigo-bright font-semibold disabled:opacity-40">
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {networkMode === 'mainnet' && MAINNET_POOLS_V4.length === 0 && (
          <div className="mb-4 text-[12px] text-danger bg-danger/[0.06] border border-danger/20 rounded-[12px] px-3.5 py-2.5">
            No mainnet pools are configured right now, so mainnet mode is unavailable. Check lib/uniV4PoolConfig.js —
            MAINNET_POOLS_V4 is empty or failed to load.
          </div>
        )}

        {isMainnet && (
          <div className="mb-4 text-[12px] text-amber-400 bg-amber-400/[0.06] border border-amber-400/20 rounded-[12px] px-3.5 py-2.5">
            Arc Mainnet — real funds. Positions are full-range only for now, and Remove Liquidity needs your position's
            Token ID + tick range (see the form below).
          </div>
        )}

        <div className="mb-4">
          <PremiumSelector
            options={isMainnet ? MAINNET_POOL_OPTIONS : POOL_OPTIONS}
            value={isMainnet ? v4PoolKey : poolKey}
            onChange={isMainnet ? setV4PoolKey : setPoolKey}
          />
        </div>

        {/* Contract badge */}
        <div className="relative mb-5">
          <button
            onClick={() => setEngineOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 bg-white/[0.025] border border-white/5 hover:border-indigo-bright/30 transition-colors rounded-[14px] px-4 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <EngineLogo className="w-6 h-6" />
              <div className="text-left">
                <div className="text-[13px] font-bold flex items-center gap-1.5">
                  {isMainnet ? 'Uniswap v4 on Arc Mainnet' : 'Secured by ArrowPool Engine'}
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-indigo-bright">
                    <path fillRule="evenodd" d="M10 1.5l2.163 1.44 2.59-.2 1.02 2.393 2.393 1.02-.2 2.59L19.5 10l-1.44 2.163.2 2.59-2.393 1.02-1.02 2.393-2.59-.2L10 19.5l-2.163-1.44-2.59.2-1.02-2.393-2.393-1.02.2-2.59L.5 10l1.44-2.163-.2-2.59 2.393-1.02 1.02-2.393 2.59.2L10 1.5zm3.03 6.28a.75.75 0 00-1.06-1.06L8.5 10.19l-1.47-1.47a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l3.5-3.5z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-[11px] text-dim">
                  {isMainnet && activeV4Pool ? `${(activeV4Pool.fee / 10000).toFixed(2)}% fee · tickSpacing ${activeV4Pool.tickSpacing}` : 'Constant-product AMM · 0.30% fee'}
                </div>
              </div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 text-dim transition-transform ${engineOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {engineOpen && (
            <div className="absolute z-20 mt-2 w-full bg-[#0A0A10] border border-white/10 rounded-[14px] p-4 shadow-xl">
              <div className="text-[11px] text-dim mb-1.5">{isMainnet ? `${activeV4Pool?.currency0.symbol} token address` : 'Pool contract address'}</div>
              {(() => {
                const addr = isMainnet ? activeV4Pool?.currency0.address : activePoolConfig.pool.address;
                if (!addr) return <div className="text-[12px] text-dim">Not available.</div>;
                return (
                  <div className="flex items-center gap-2 bg-white/[0.03] rounded-[10px] px-3 py-2">
                    <span className="font-mono text-[12px] text-ivory truncate flex-1">
                      {addr.slice(0, 10)}…{addr.slice(-8)}
                    </span>
                    <button onClick={copyAddress} className="text-indigo-bright text-[11px] font-semibold flex-shrink-0">{copied ? 'Copied' : 'Copy'}</button>
                    <a
                      href={isMainnet ? MAINNET_EXPLORER_ADDR(addr) : EXPLORER_ADDR(addr)}
                      target="_blank" rel="noreferrer" className="text-indigo-bright text-[11px] font-semibold flex-shrink-0"
                    >
                      View ↗
                    </a>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {isMainnet ? (
          /* ── Mainnet v4 stats ─────────────────────────────────────── */
          <div className="glass hero-ring p-5 sm:p-7 mb-5 relative overflow-hidden">
            <div
              className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(139,127,255,0.12), transparent 70%)' }}
            />
            <div className="relative grid grid-cols-2 gap-4">
              <div>
                <div className="card-label mb-1.5">{activeV4Pool?.currency0.symbol} Balance</div>
                <div className="font-mono text-xl font-bold">{v4PoolState && activeV4Pool ? fmt(v4PoolState.balance0, activeV4Pool.currency0.decimals === 8 ? 8 : 4) : '—'}</div>
              </div>
              <div>
                <div className="card-label mb-1.5">{activeV4Pool?.currency1.symbol} Balance</div>
                <div className="font-mono text-xl font-bold">{v4PoolState ? fmt(v4PoolState.balance1) : '—'}</div>
              </div>
              <div>
                <div className="card-label mb-1.5">Pool Tick</div>
                <div className="font-mono text-xl font-bold">{v4PoolState ? v4PoolState.tick : '—'}</div>
              </div>
              <div>
                <div className="card-label mb-1.5">Est. Rate</div>
                <div className="font-mono text-xl font-bold text-indigo-bright">
                  {v4Display ? `1 ${v4Display.base} ≈ ${formatPrice(v4Display.price)} ${v4Display.quote}` : '—'}
                </div>
                {v4Display && (
                  <div className="font-mono text-[11px] text-dim mt-1">
                    1 {v4Display.quote} ≈ {formatPrice(v4Display.inverse)} {v4Display.base}
                  </div>
                )}
              </div>
            </div>
            {v4PoolState && !v4PoolState.initialized && (
              <div className="relative mt-4 text-sm text-danger">
                This pool reads as uninitialized — double check fee/tickSpacing/hooks in lib/uniV4PoolConfig.js
                against the real deployed pool.
              </div>
            )}
            {error && <div className="relative mt-4 text-sm text-danger">{error}</div>}
          </div>
        ) : (
          /* ── Testnet stats (unchanged) ────────────────────────────── */
          <div className="glass hero-ring p-5 sm:p-7 mb-5 relative overflow-hidden">
            <div
              className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(139,127,255,0.12), transparent 70%)' }}
            />
            <div className="relative flex flex-col sm:flex-row gap-6 sm:gap-8">
              <div className="flex-shrink-0 flex sm:flex-col items-center sm:items-start gap-4 sm:gap-3">
                <div className="relative w-[92px] h-[92px] flex-shrink-0">
                  <div className="w-full h-full rounded-full transition-all duration-700" style={{ background: donutBackground }} />
                  <div className="absolute inset-[9px] rounded-full bg-[#0A0A10] flex flex-col items-center justify-center">
                    <div className="font-mono text-[11px] font-bold text-indigo-bright">{price ? `1:${price.toFixed(2)}` : '—'}</div>
                    <div className="text-[8.5px] text-dim uppercase tracking-wider">rate</div>
                  </div>
                </div>
                <div className="text-[11px] space-y-1">
                  <div className="flex items-center gap-1.5 text-dim"><span className="w-2 h-2 rounded-full bg-[#5FE0A8]" /> WUSDC</div>
                  <div className="flex items-center gap-1.5 text-dim"><span className={`w-2 h-2 rounded-full ${tokenBDotColor}`} /> {tokenBSymbol}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 flex-1">
                <div>
                  <div className="card-label mb-1.5">WUSDC Reserve</div>
                  <div className="font-mono text-xl font-bold">{poolState ? fmt(reserveWusdc, 2) : '—'}</div>
                </div>
                <div>
                  <div className="card-label mb-1.5">{tokenBSymbol} Reserve</div>
                  <div className="font-mono text-xl font-bold">{poolState ? fmt(reserveArrow, 2) : '—'}</div>
                </div>
                <div>
                  <div className="card-label mb-1.5">Est. TVL</div>
                  <div className="font-mono text-xl font-bold text-indigo-bright">{tvlWusdc != null ? `${fmt(tvlWusdc, 0)} WUSDC` : '—'}</div>
                </div>
                <div>
                  <div className="card-label mb-1.5">LP Supply</div>
                  <div className="font-mono text-xl font-bold">{poolState ? fmt(totalSupply, 4) : '—'}</div>
                </div>
              </div>
            </div>

            {isConnected && poolState && (
              <div className="relative mt-6 pt-5 border-t border-white/5">
                <div className="card-label mb-3">Your Position</div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex gap-5">
                    <div>
                      <div className="text-[10.5px] text-dim">LP tokens</div>
                      <div className="font-mono text-sm font-bold mt-0.5">{fmt(lpBalance, 6)}</div>
                    </div>
                    <div>
                      <div className="text-[10.5px] text-dim">Pool share</div>
                      <div className="font-mono text-sm font-bold mt-0.5 text-indigo-bright">{poolShare.toFixed(4)}%</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-dim">
                    Withdrawable now: <span className="text-ivory font-mono">{fmt(yourWusdcValue, 2)} WUSDC</span> + <span className="text-ivory font-mono">{fmt(yourArrowValue, 2)} {tokenBSymbol}</span>
                  </div>
                </div>
              </div>
            )}

            {error && <div className="relative mt-4 text-sm text-danger">{error}</div>}
          </div>
        )}

        {/* Wrap / Unwrap — testnet only */}
        {!isMainnet && isConnected && (
          <div className="glass p-5 sm:p-7 mb-5">
            <div className="flex gap-2 mb-5">
              <button onClick={() => setWrapTab('wrap')} className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-colors ${wrapTab === 'wrap' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory'}`}>Wrap</button>
              <button onClick={() => setWrapTab('unwrap')} className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-colors ${wrapTab === 'unwrap' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory'}`}>Unwrap</button>
            </div>
            {wrapTab === 'wrap' ? (
              <>
                <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
                  <div className="flex justify-between text-[11.5px] text-dim mb-3">
                    <span>USDC</span>
                    <span className="flex items-center gap-1.5"><LivePulse ok /> 1 USDC = 1 WUSDC</span>
                  </div>
                  <input type="number" value={wrapAmount} onChange={(e) => setWrapAmount(e.target.value)} placeholder="0.00" className="w-full bg-transparent font-mono text-2xl outline-none text-ivory" />
                </div>
                <button onClick={handleWrapUsdc} disabled={!wrapAmount || parseFloat(wrapAmount) <= 0} className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed">Wrap</button>
                <p className="text-[11.5px] text-dim leading-relaxed mt-3">Add Liquidity requires WUSDC (not native USDC directly). Wrap here first if your WUSDC balance is 0.</p>
              </>
            ) : (
              <>
                <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
                  <div className="flex justify-between text-[11.5px] text-dim mb-3">
                    <span>WUSDC</span>
                    <span>Balance: {poolState ? fmt(wusdcBalance) : '—'}</span>
                  </div>
                  <input type="number" value={unwrapAmount} onChange={(e) => setUnwrapAmount(e.target.value)} placeholder="0.00" className="w-full bg-transparent font-mono text-2xl outline-none text-ivory" />
                </div>
                <button onClick={handleUnwrapUsdc} disabled={!unwrapAmount || parseFloat(unwrapAmount) <= 0} className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed">Unwrap</button>
                <p className="text-[11.5px] text-dim leading-relaxed mt-3">Converts WUSDC back to native USDC 1:1.</p>
              </>
            )}
          </div>
        )}

        {/* Add / Remove Liquidity */}
        <div className="glass p-5 sm:p-7">
          <div className="flex gap-2 mb-6">
            <button onClick={() => setTab('add')} className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-colors ${tab === 'add' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory'}`}>Add Liquidity</button>
            <button onClick={() => setTab('remove')} className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-colors ${tab === 'remove' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory'}`}>Remove Liquidity</button>
          </div>

          {!isConnected ? (
            <button onClick={connect} className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform">Connect Wallet</button>
          ) : isMainnet && activeV4Pool ? (
            tab === 'add' ? (
              <FeeAddLiquidityPanel
                poolCfg={activeV4Pool}
                poolState={v4PoolState}
                price={v4Price}
                address={address}
                onRefresh={refreshV4}
                explorerTx={MAINNET_EXPLORER_TX}
                onMinted={({ tokenId, liquidity, tickLower, tickUpper }) => {
                  setV4RemoveTokenId(String(tokenId));
                  setV4RemoveLiquidity(String(liquidity));
                  setV4RemoveTickLower(String(tickLower));
                  setV4RemoveTickUpper(String(tickUpper));
                }}
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-4">
                    <div className="text-[11px] text-dim mb-2">Token ID</div>
                    <input type="number" value={v4RemoveTokenId} onChange={(e) => setV4RemoveTokenId(e.target.value)} placeholder="e.g. 4821" className="w-full bg-transparent font-mono text-lg outline-none text-ivory" />
                  </div>
                  <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-4">
                    <div className="text-[11px] text-dim mb-2">Liquidity</div>
                    <input type="text" value={v4RemoveLiquidity} onChange={(e) => setV4RemoveLiquidity(e.target.value)} placeholder="raw liquidity" className="w-full bg-transparent font-mono text-lg outline-none text-ivory" />
                  </div>
                  <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-4">
                    <div className="text-[11px] text-dim mb-2">Tick Lower</div>
                    <input type="number" value={v4RemoveTickLower} onChange={(e) => setV4RemoveTickLower(e.target.value)} placeholder="e.g. -887220" className="w-full bg-transparent font-mono text-lg outline-none text-ivory" />
                  </div>
                  <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-4">
                    <div className="text-[11px] text-dim mb-2">Tick Upper</div>
                    <input type="number" value={v4RemoveTickUpper} onChange={(e) => setV4RemoveTickUpper(e.target.value)} placeholder="e.g. 887220" className="w-full bg-transparent font-mono text-lg outline-none text-ivory" />
                  </div>
                </div>
                <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-4 mb-5">
                  <div className="flex justify-between text-[11px] text-dim mb-2">
                    <span>Percent to remove</span>
                    <span className="font-mono text-ivory">{v4RemovePct}%</span>
                  </div>
                  <input type="range" min="1" max="100" value={v4RemovePct} onChange={(e) => setV4RemovePct(parseInt(e.target.value, 10))} className="w-full" />
                </div>
                <p className="text-[11.5px] text-dim leading-relaxed mb-4">
                  v4 positions are NFTs, not a token balance — enter the Token ID, tick range, and current liquidity
                  of the position you minted (from your wallet, the explorer, or the tx that created it).
                </p>
                <button
                  onClick={handleRemoveV4Liquidity}
                  disabled={!v4RemoveTokenId || !v4RemoveTickLower || !v4RemoveTickUpper || !v4RemoveLiquidity}
                  className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Remove Liquidity
                </button>
              </>
            )
          ) : tab === 'add' ? (
            <>
              <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
                <div className="flex justify-between text-[11.5px] text-dim mb-3">
                  <span>WUSDC</span>
                  <span>Balance: {poolState ? fmt(wusdcBalance) : '—'}</span>
                </div>
                <input type="number" value={amountWusdc} onChange={(e) => handleWusdcChange(e.target.value)} placeholder="0.00" className="w-full bg-transparent font-mono text-2xl outline-none text-ivory" />
              </div>
              <div className="flex justify-center -my-1 relative z-10">
                <span className="w-7 h-7 rounded-full bg-[#0A0A10] border border-white/10 flex items-center justify-center text-dim">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                </span>
              </div>
              <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-5">
                <div className="flex justify-between text-[11.5px] text-dim mb-3">
                  <span>{tokenBSymbol}</span>
                  <span>Balance: {poolState ? fmt(tokenBBalance) : '—'}</span>
                </div>
                <input type="number" value={amountArrow} onChange={(e) => handleArrowChange(e.target.value)} placeholder="0.00" className="w-full bg-transparent font-mono text-2xl outline-none text-ivory" />
              </div>
              {estLpOut != null && (
                <div className="flex justify-between text-xs text-dim mb-5 px-1">
                  <span>You'll receive</span>
                  <span className="font-mono text-ivory/80">≈ {fmt(estLpOut, 6)} LP tokens</span>
                </div>
              )}
              <button onClick={handleAddLiquidity} disabled={!amountWusdc || !amountArrow || parseFloat(amountWusdc) <= 0} className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed">Add Liquidity</button>
            </>
          ) : (
            <>
              <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
                <div className="flex justify-between text-[11.5px] text-dim mb-3">
                  <span>LP Tokens to remove</span>
                  <span>
                    Balance: {poolState ? fmt(poolState.lpBalance, 6) : '—'}{' '}
                    <button className="text-indigo-bright font-semibold ml-1" onClick={() => setRemoveAmount(poolState?.lpBalance || '')}>MAX</button>
                  </span>
                </div>
                <input type="number" value={removeAmount} onChange={(e) => setRemoveAmount(e.target.value)} placeholder="0.00" className="w-full bg-transparent font-mono text-2xl outline-none text-ivory" />
              </div>
              {estRemoveOut && (
                <div className="bg-white/[0.02] border border-white/5 rounded-[14px] p-4 mb-5 space-y-2">
                  <div className="text-[11px] text-dim mb-1">You'll receive</div>
                  <div className="flex justify-between text-sm"><span className="text-dim">WUSDC</span><span className="font-mono font-semibold">{fmt(estRemoveOut.wusdc)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-dim">{tokenBSymbol}</span><span className="font-mono font-semibold">{fmt(estRemoveOut.arrow)}</span></div>
                </div>
              )}
              <button onClick={handleRemoveLiquidity} disabled={!removeAmount || parseFloat(removeAmount) <= 0} className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed">Remove Liquidity</button>
            </>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} closeable={modalDone || !!modalError}>
        <div className="mb-5">
          <div className="card-label mb-2">{modalDone ? 'Complete' : modalError ? 'Failed' : 'In Progress'}</div>
          <h2 className="text-xl font-bold">{tab === 'add' ? 'Adding Liquidity' : 'Removing Liquidity'}</h2>
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
          <a href={isMainnet ? MAINNET_EXPLORER_TX(txHash) : EXPLORER_TX(txHash)} target="_blank" rel="noreferrer" className="text-indigo-bright text-sm font-mono">
            View transaction →
          </a>
        )}
        {modalError && <div className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-[12px] p-3.5">{modalError}</div>}
        {(modalDone || modalError) && (
          <button onClick={() => setModalOpen(false)} className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14px] py-3.5 rounded-[13px] shadow-glow">Close</button>
        )}
      </Modal>

      <Modal open={wrapModalOpen} onClose={() => setWrapModalOpen(false)} closeable={wrapDone || !!wrapError}>
        <div className="mb-5">
          <div className="card-label mb-2">{wrapDone ? 'Complete' : wrapError ? 'Failed' : 'In Progress'}</div>
          <h2 className="text-xl font-bold">{wrapTab === 'wrap' ? 'Wrapping USDC' : 'Unwrapping WUSDC'}</h2>
        </div>
        {!wrapDone && !wrapError && (
          <div className="space-y-3">
            {['Confirm in wallet', 'Submitting to Arc', 'Waiting for confirmation'].map((label, i) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                {i < wrapStep ? (
                  <span className="w-4 h-4 rounded-full bg-success/20 text-success flex items-center justify-center text-[10px]">✓</span>
                ) : i === wrapStep ? (
                  <span className="w-4 h-4 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin flex-shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-white/10 flex-shrink-0" />
                )}
                <span className={i <= wrapStep ? 'text-ivory' : 'text-dim'}>{i === wrapStep ? (wrapStatus || label) : label}</span>
              </div>
            ))}
          </div>
        )}
        {wrapDone && wrapTxHash && (
          <a href={EXPLORER_TX(wrapTxHash)} target="_blank" rel="noreferrer" className="text-indigo-bright text-sm font-mono">View transaction →</a>
        )}
        {wrapError && <div className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-[12px] p-3.5">{wrapError}</div>}
        {(wrapDone || wrapError) && (
          <button onClick={() => setWrapModalOpen(false)} className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14px] py-3.5 rounded-[13px] shadow-glow">Close</button>
        )}
      </Modal>
    </AppShell>
  );
}