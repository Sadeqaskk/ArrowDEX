'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AppShell from '../../components/AppShell';
import Modal from '../../components/Modal';
import PremiumSelector from '../../components/PremiumSelector';
import { useWallet } from '../../lib/WalletContext';
import {
  getPoolState, addLiquidity, removeLiquidity, wrapUsdc, unwrapUsdc,
  getEurcPoolState, addEurcLiquidity, removeEurcLiquidity,
} from '../../lib/pool';
import { POOL_CONFIG, EURC_POOL_CONFIG } from '../../lib/poolConfig';
import { useNotify } from '../../components/NotificationProvider';

const EXPLORER_TX = (hash) => `https://testnet.arcscan.app/tx/${hash}`;
const EXPLORER_ADDR = (addr) => `https://testnet.arcscan.app/address/${addr}`;

// Real token artwork for the pair badge — same folder EngineLogo already
// pulls from, so every icon on this page comes from one source of truth.
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

// Same mark used on the Swap page so the protocol reads as one brand
// wherever its contracts show up.
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

export default function PoolsPage() {
  const { address, isConnected, connect } = useWallet();
  const notify = useNotify();

  // Which pool is selected — 'wusdcArrow' is the original default, so
  // everything below renders exactly as it always did until this changes.
  const [poolKey, setPoolKey] = useState('wusdcArrow');
  const isEurc = poolKey === 'wusdcEurc';
  const activePoolConfig = isEurc ? EURC_POOL_CONFIG : POOL_CONFIG;
  const tokenBSymbol = isEurc ? 'EURC' : 'ARROW';
  const tokenBDotColor = isEurc ? 'bg-[#F5C451]' : 'bg-[#8B7FFF]';

  const [poolState, setPoolState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const refreshingRef = useRef(false);

  const [tab, setTab] = useState('add');
  const [amountWusdc, setAmountWusdc] = useState('');
  const [amountArrow, setAmountArrow] = useState('');
  const [removeAmount, setRemoveAmount] = useState('');

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

  const refresh = useCallback(async () => {
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
  }, [address, isEurc]);

  useEffect(() => { refresh(); }, [refresh]);

  // Reset in-flight amounts whenever the selected pool changes, so a WUSDC
  // amount typed for one pool never gets silently submitted to the other.
  useEffect(() => {
    setAmountWusdc('');
    setAmountArrow('');
    setRemoveAmount('');
    setPoolState(null);
  }, [poolKey]);

  const reserveWusdc = poolState ? parseFloat(poolState.reserveWusdc) : 0;
  const reserveArrow = poolState ? parseFloat(isEurc ? poolState.reserveEurc : poolState.reserveArrow) : 0;
  const totalSupply = poolState ? parseFloat(poolState.totalSupply) : 0;
  const lpBalance = poolState ? parseFloat(poolState.lpBalance) : 0;

  const price = poolState && reserveWusdc > 0 ? reserveArrow / reserveWusdc : null;

  const poolShare = poolState && totalSupply > 0 ? (lpBalance / totalSupply) * 100 : 0;

  // Constant-product AMMs are value-balanced across both sides at any given
  // reserve state (reserveA · priceA == reserveB), so total value locked in
  // WUSDC terms is simply 2× the WUSDC-side reserve — no external price feed needed.
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
    if (price && val) {
      setAmountArrow((parseFloat(val) * price).toFixed(6));
    }
  }
  function handleArrowChange(val) {
    setAmountArrow(val);
    if (price && val) {
      setAmountWusdc((parseFloat(val) / price).toFixed(6));
    }
  }

  // "You'll receive" previews — the piece every serious AMM UI shows before
  // the user signs anything.
  const estLpOut = useMemo(() => {
    const w = parseFloat(amountWusdc);
    const a = parseFloat(amountArrow);
    if (!poolState || !w || w <= 0 || !a || a <= 0) return null;
    if (totalSupply > 0 && reserveWusdc > 0) {
      return (w / reserveWusdc) * totalSupply;
    }
    // First-ever deposit sets the price: LP ≈ sqrt(w * a), Uniswap-style.
    return Math.sqrt(w * a);
  }, [amountWusdc, amountArrow, poolState, totalSupply, reserveWusdc]);

  const estRemoveOut = useMemo(() => {
    const r = parseFloat(removeAmount);
    if (!poolState || !r || r <= 0 || totalSupply <= 0) return null;
    const fraction = r / totalSupply;
    return { wusdc: fraction * reserveWusdc, arrow: fraction * reserveArrow };
  }, [removeAmount, poolState, totalSupply, reserveWusdc, reserveArrow]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(activePoolConfig.pool.address);
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
        ? await addEurcLiquidity({
            account: address,
            amountWusdc,
            amountEurc: amountArrow,
            onStatus: setModalStatus,
          })
        : await addLiquidity({
            account: address,
            amountWusdc,
            amountArrow,
            onStatus: setModalStatus,
          });
      setTxHash(hash);
      notify({
        type: 'addLiquidity',
        title: 'Added Liquidity',
        message: `${amountWusdc} WUSDC + ${amountArrow} ${tokenBSymbol} deposited`,
        txHash: hash,
      });
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
        ? await removeEurcLiquidity({
            account: address,
            lpAmount: removeAmount,
            onStatus: setModalStatus,
          })
        : await removeLiquidity({
            account: address,
            lpAmount: removeAmount,
            onStatus: setModalStatus,
          });
      setTxHash(hash);
      notify({
        type: 'removeLiquidity',
        title: 'Removed Liquidity',
        message: `${removeAmount} LP tokens withdrawn`,
        txHash: hash,
      });
      setModalStep(2);
      setModalDone(true);
      setRemoveAmount('');
      refresh();
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
      notify({
        type: 'wrap',
        title: `Wrapped ${wrapAmount} USDC`,
        message: 'Converted to WUSDC 1:1',
        txHash: hash,
      });
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
      notify({
        type: 'unwrap',
        title: `Unwrapped ${unwrapAmount} WUSDC`,
        message: 'Converted back to USDC 1:1',
        txHash: hash,
      });
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
            <h1 className="text-2xl sm:text-[28px] font-bold">WUSDC / {tokenBSymbol} Pool</h1>
            <p className="text-dim text-sm mt-1.5">
              A real constant-product AMM on Arc Testnet. Deposit both tokens to earn 0.30% of every trade.
            </p>
          </div>
          <button onClick={refresh} disabled={loading} className="text-xs text-indigo-bright font-semibold disabled:opacity-40 flex-shrink-0">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Pool selector — new. Defaults to WUSDC/ARROW so nothing below changes unless switched. */}
        <div className="mb-4">
          <PremiumSelector options={POOL_OPTIONS} value={poolKey} onChange={setPoolKey} />
        </div>

        {/* Contract badge — same treatment as the Swap page's engine badge */}
        <div className="relative mb-5">
          <button
            onClick={() => setEngineOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 bg-white/[0.025] border border-white/5 hover:border-indigo-bright/30 transition-colors rounded-[14px] px-4 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <EngineLogo className="w-6 h-6" />
              <div className="text-left">
                <div className="text-[13px] font-bold flex items-center gap-1.5">
                  Secured by ArrowPool Engine
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-indigo-bright">
                    <path fillRule="evenodd" d="M10 1.5l2.163 1.44 2.59-.2 1.02 2.393 2.393 1.02-.2 2.59L19.5 10l-1.44 2.163.2 2.59-2.393 1.02-1.02 2.393-2.59-.2L10 19.5l-2.163-1.44-2.59.2-1.02-2.393-2.393-1.02.2-2.59L.5 10l1.44-2.163-.2-2.59 2.393-1.02 1.02-2.393 2.59.2L10 1.5zm3.03 6.28a.75.75 0 00-1.06-1.06L8.5 10.19l-1.47-1.47a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l3.5-3.5z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-[11px] text-dim">Constant-product AMM · 0.30% fee</div>
              </div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 text-dim transition-transform ${engineOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {engineOpen && (
            <div className="absolute z-20 mt-2 w-full bg-[#0A0A10] border border-white/10 rounded-[14px] p-4 shadow-xl">
              <div className="text-[11px] text-dim mb-1.5">Pool contract address</div>
              <div className="flex items-center gap-2 bg-white/[0.03] rounded-[10px] px-3 py-2">
                <span className="font-mono text-[12px] text-ivory truncate flex-1">
                  {activePoolConfig.pool.address.slice(0, 10)}…{activePoolConfig.pool.address.slice(-8)}
                </span>
                <button onClick={copyAddress} className="text-indigo-bright text-[11px] font-semibold flex-shrink-0">{copied ? 'Copied' : 'Copy'}</button>
                <a href={EXPLORER_ADDR(activePoolConfig.pool.address)} target="_blank" rel="noreferrer" className="text-indigo-bright text-[11px] font-semibold flex-shrink-0">View ↗</a>
              </div>
            </div>
          )}
        </div>

        {/* Pool stats + composition */}
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

        {/* Wrap / Unwrap — unchanged, always WUSDC<->USDC regardless of selected pool */}
        {isConnected && (
          <div className="glass p-5 sm:p-7 mb-5">
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setWrapTab('wrap')}
                className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-colors ${wrapTab === 'wrap' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory'}`}
              >
                Wrap
              </button>
              <button
                onClick={() => setWrapTab('unwrap')}
                className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-colors ${wrapTab === 'unwrap' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory'}`}
              >
                Unwrap
              </button>
            </div>

            {wrapTab === 'wrap' ? (
              <>
                <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
                  <div className="flex justify-between text-[11.5px] text-dim mb-3">
                    <span>USDC</span>
                    <span className="flex items-center gap-1.5"><LivePulse ok /> 1 USDC = 1 WUSDC</span>
                  </div>
                  <input
                    type="number"
                    value={wrapAmount}
                    onChange={(e) => setWrapAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-transparent font-mono text-2xl outline-none text-ivory"
                  />
                </div>
                <button
                  onClick={handleWrapUsdc}
                  disabled={!wrapAmount || parseFloat(wrapAmount) <= 0}
                  className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Wrap
                </button>
                <p className="text-[11.5px] text-dim leading-relaxed mt-3">
                  Add Liquidity requires WUSDC (not native USDC directly). Wrap here first if your WUSDC balance is 0.
                </p>
              </>
            ) : (
              <>
                <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
                  <div className="flex justify-between text-[11.5px] text-dim mb-3">
                    <span>WUSDC</span>
                    <span>Balance: {poolState ? fmt(wusdcBalance) : '—'}</span>
                  </div>
                  <input
                    type="number"
                    value={unwrapAmount}
                    onChange={(e) => setUnwrapAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-transparent font-mono text-2xl outline-none text-ivory"
                  />
                </div>
                <button
                  onClick={handleUnwrapUsdc}
                  disabled={!unwrapAmount || parseFloat(unwrapAmount) <= 0}
                  className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Unwrap
                </button>
                <p className="text-[11.5px] text-dim leading-relaxed mt-3">
                  Converts WUSDC back to native USDC 1:1.
                </p>
              </>
            )}
          </div>
        )}

        {/* Add / Remove Liquidity */}
        <div className="glass p-5 sm:p-7">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab('add')}
              className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-colors ${tab === 'add' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory'}`}
            >
              Add Liquidity
            </button>
            <button
              onClick={() => setTab('remove')}
              className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-colors ${tab === 'remove' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory'}`}
            >
              Remove Liquidity
            </button>
          </div>

          {!isConnected ? (
            <button onClick={connect} className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform">
              Connect Wallet
            </button>
          ) : tab === 'add' ? (
            <>
              <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
                <div className="flex justify-between text-[11.5px] text-dim mb-3">
                  <span>WUSDC</span>
                  <span>Balance: {poolState ? fmt(wusdcBalance) : '—'}</span>
                </div>
                <input
                  type="number"
                  value={amountWusdc}
                  onChange={(e) => handleWusdcChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent font-mono text-2xl outline-none text-ivory"
                />
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
                <input
                  type="number"
                  value={amountArrow}
                  onChange={(e) => handleArrowChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent font-mono text-2xl outline-none text-ivory"
                />
              </div>

              {estLpOut != null && (
                <div className="flex justify-between text-xs text-dim mb-5 px-1">
                  <span>You'll receive</span>
                  <span className="font-mono text-ivory/80">≈ {fmt(estLpOut, 6)} LP tokens</span>
                </div>
              )}

              <button
                onClick={handleAddLiquidity}
                disabled={!amountWusdc || !amountArrow || parseFloat(amountWusdc) <= 0}
                className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add Liquidity
              </button>
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
                <input
                  type="number"
                  value={removeAmount}
                  onChange={(e) => setRemoveAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent font-mono text-2xl outline-none text-ivory"
                />
              </div>

              {estRemoveOut && (
                <div className="bg-white/[0.02] border border-white/5 rounded-[14px] p-4 mb-5 space-y-2">
                  <div className="text-[11px] text-dim mb-1">You'll receive</div>
                  <div className="flex justify-between text-sm">
                    <span className="text-dim">WUSDC</span>
                    <span className="font-mono font-semibold">{fmt(estRemoveOut.wusdc)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-dim">{tokenBSymbol}</span>
                    <span className="font-mono font-semibold">{fmt(estRemoveOut.arrow)}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleRemoveLiquidity}
                disabled={!removeAmount || parseFloat(removeAmount) <= 0}
                className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Remove Liquidity
              </button>
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
          <a href={EXPLORER_TX(txHash)} target="_blank" rel="noreferrer" className="text-indigo-bright text-sm font-mono">
            View transaction →
          </a>
        )}
        {modalError && (
          <div className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-[12px] p-3.5">{modalError}</div>
        )}
        {(modalDone || modalError) && (
          <button onClick={() => setModalOpen(false)} className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14px] py-3.5 rounded-[13px] shadow-glow">
            Close
          </button>
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
          <a href={EXPLORER_TX(wrapTxHash)} target="_blank" rel="noreferrer" className="text-indigo-bright text-sm font-mono">
            View transaction →
          </a>
        )}
        {wrapError && (
          <div className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-[12px] p-3.5">{wrapError}</div>
        )}
        {(wrapDone || wrapError) && (
          <button onClick={() => setWrapModalOpen(false)} className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14px] py-3.5 rounded-[13px] shadow-glow">
            Close
          </button>
        )}
      </Modal>
    </AppShell>
  );
}