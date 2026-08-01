'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppShell from '../../components/AppShell';
import Modal from '../../components/Modal';
import { useWallet } from '../../lib/WalletContext';
import { TOKENS, findPool } from '../../lib/swapConfig';
import { getPoolState, quoteSwap, executeSwap } from '../../lib/swap';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const msg = (err && err.message) || '';
  return msg.includes('request limit reached') || msg.includes('rate limit') || msg.includes('429');
}

function TokenIcon({ token, className }) {
  if (token?.logo) {
    return <img src={token.logo} alt={token.symbol} className={`${className} object-cover flex-shrink-0`} />;
  }
  return <span className={`${className} rounded-full bg-gradient-to-br ${token.color} flex-shrink-0`} />;
}

export default function SwapPage() {
  const { address, isConnected, connect } = useWallet();

  const [poolState, setPoolState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const refreshingRef = useRef(false);

  const [payToken, setPayToken] = useState('USDC');
  const [receiveToken, setReceiveToken] = useState('EURC');
  const [payAmount, setPayAmount] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('0.00');
  const [quoting, setQuoting] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
  const [pickerOpen, setPickerOpen] = useState(null); // 'pay' | 'receive' | null

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState('');
  const [modalError, setModalError] = useState(null);
  const [modalDone, setModalDone] = useState(false);
  const [txHash, setTxHash] = useState(null);

  const payTokenData = TOKENS.find((t) => t.symbol === payToken);
  const receiveTokenData = TOKENS.find((t) => t.symbol === receiveToken);
  const pool = findPool(payToken, receiveToken); // null = no direct pool for this pair

  const payBalance = poolState ? poolState.balancesFormatted[payToken] : null;
  const receiveBalance = poolState ? poolState.balancesFormatted[receiveToken] : null;

  const refresh = useCallback(async () => {
    if (!pool) {
      setPoolState(null);
      setError(null);
      return;
    }
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    setLoading(true);
    setError(null);

    const maxAttempts = 4;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const state = await getPoolState(pool, address);
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
  }, [address, pool]);

  // Refetch whenever the wallet OR the selected pair (and therefore pool) changes.
  useEffect(() => { refresh(); }, [refresh]);

  // Re-quote whenever the pay amount, pair, or pool reserves change.
  useEffect(() => {
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
  }, [payAmount, payToken, receiveToken, pool, poolState]);

  const priceImpact = payAmount && parseFloat(payAmount) > 0 && poolState
    ? (() => {
        const reserveIn = parseFloat(poolState.reservesFormatted[payToken]);
        if (!reserveIn) return '—';
        return `${((parseFloat(payAmount) / reserveIn) * 100).toFixed(2)}%`;
      })()
    : '—';

  function flipTokens() {
    const p = payToken;
    setPayToken(receiveToken);
    setReceiveToken(p);
    setPayAmount('');
  }

  function selectToken(symbol) {
    const token = TOKENS.find((t) => t.symbol === symbol);
    if (token?.disabled) return; // cirBTC: coming soon, not selectable

    if (pickerOpen === 'pay') {
      if (symbol === receiveToken) flipTokens();
      else setPayToken(symbol);
    } else if (pickerOpen === 'receive') {
      if (symbol === payToken) flipTokens();
      else setReceiveToken(symbol);
    }
    setPickerOpen(null);
    setPayAmount('');
  }

  async function handleReviewSwap() {
    if (!pool) return;
    setModalOpen(true);
    setModalDone(false);
    setModalError(null);
    setTxHash(null);
    try {
      const minAmountOut = (parseFloat(receiveAmount) * (1 - slippage / 100)).toFixed(18);
      const hash = await executeSwap({
        account: address,
        pool,
        payTokenSymbol: payToken,
        receiveTokenSymbol: receiveToken,
        amountIn: payAmount,
        minAmountOut,
        onStatus: setModalStatus,
      });
      setTxHash(hash);
      setModalDone(true);
      setPayAmount('');
      refresh();
    } catch (err) {
      console.error(err);
      setModalError(err.shortMessage || err.message || 'Swap failed.');
    }
  }

  return (
    <AppShell>
      <div className="max-w-[520px] mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="card-label mb-2">Exchange</div>
            <h1 className="text-[28px] font-bold">Swap Assets</h1>
            <p className="text-dim text-sm mt-1.5">Real swaps on Arc Testnet via ArrowSwap.</p>
          </div>
          <button onClick={refresh} disabled={loading} className="text-xs text-indigo-bright font-semibold disabled:opacity-40">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && <div className="mb-4 text-sm text-danger">{error}</div>}
        {!pool && (
          <div className="mb-4 text-sm text-dim">
            There's no direct pool for {payToken} → {receiveToken} yet.
          </div>
        )}

        <div className="glass hero-ring p-7 relative">
          {/* PAY */}
          <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5">
            <div className="flex justify-between text-[11.5px] text-dim mb-3">
              <span>You pay</span>
              <span>
                Balance: {payBalance ? parseFloat(payBalance).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}{' '}
                <button
                  className="text-indigo-bright font-semibold ml-1"
                  onClick={() => payBalance && setPayAmount(payBalance)}
                >
                  MAX
                </button>
              </span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <button
                onClick={() => setPickerOpen(pickerOpen === 'pay' ? null : 'pay')}
                className="flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.06] transition-colors rounded-full px-3 py-2 text-[14px] font-bold flex-shrink-0"
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
                className="bg-transparent text-right font-mono text-2xl outline-none w-full text-ivory placeholder:text-dim/40"
              />
            </div>
            {pickerOpen === 'pay' && (
              <TokenPicker tokens={TOKENS} onSelect={selectToken} />
            )}
          </div>

          {/* SWAP ARROW */}
          <div className="flex justify-center -my-[18px] relative z-10">
            <button
              onClick={flipTokens}
              className="w-11 h-11 rounded-[13px] bg-[#0A0A10] border border-white/10 flex items-center justify-center text-dim hover:text-indigo-bright hover:border-indigo-bright/40 transition-all"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" /></svg>
            </button>
          </div>

          {/* RECEIVE */}
          <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5">
            <div className="flex justify-between text-[11.5px] text-dim mb-3">
              <span>You receive</span>
              <span>Balance: {receiveBalance ? parseFloat(receiveBalance).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}</span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <button
                onClick={() => setPickerOpen(pickerOpen === 'receive' ? null : 'receive')}
                className="flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.06] transition-colors rounded-full px-3 py-2 text-[14px] font-bold flex-shrink-0"
              >
                <TokenIcon token={receiveTokenData} className="w-6 h-6 rounded-full" />
                {receiveToken}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 opacity-60"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              <div className="font-mono text-2xl text-ivory">{quoting ? '…' : receiveAmount}</div>
            </div>
            {pickerOpen === 'receive' && (
              <TokenPicker tokens={TOKENS} onSelect={selectToken} />
            )}
          </div>

          {/* DETAILS */}
          <div className="mt-5 space-y-2.5">
            <div className="flex justify-between text-xs text-dim">
              <span>Price impact</span>
              <span className="font-mono text-success">{priceImpact}</span>
            </div>
            <div className="flex justify-between text-xs text-dim items-center">
              <span>Slippage tolerance</span>
              <div className="flex gap-1.5">
                {[0.1, 0.5, 1.0].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={`px-2.5 py-1 rounded-md font-mono text-[11px] ${slippage === s ? 'bg-indigo/20 text-indigo-bright' : 'bg-white/[0.03] text-dim'}`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between text-xs text-dim">
              <span>Pool fee</span>
              <span className="font-mono">0.30%</span>
            </div>
          </div>

          {!isConnected ? (
            <button onClick={connect} className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform">
              Connect Wallet
            </button>
          ) : (
            <button
              onClick={handleReviewSwap}
              disabled={!pool || !payAmount || parseFloat(payAmount) <= 0 || quoting || parseFloat(receiveAmount) <= 0}
              className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pool ? 'Review Swap' : 'No Pool for This Pair'}
            </button>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} closeable={modalDone || !!modalError}>
        <div className="mb-6">
          <div className="card-label mb-2">{modalDone ? 'Complete' : modalError ? 'Failed' : 'In Progress'}</div>
          <h2 className="text-xl font-bold">
            {modalDone ? 'Swap Successful' : `Swapping ${payAmount} ${payToken}`}
          </h2>
          <p className="text-dim text-sm mt-1">{payToken} → {receiveToken}</p>
        </div>

        {!modalDone && !modalError && (
          <div className="flex items-center gap-3 text-sm text-ivory">
            <span className="w-4 h-4 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin" />
            {modalStatus}
          </div>
        )}
        {modalDone && txHash && (
          <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-indigo-bright text-sm font-mono">
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
            className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14px] py-3.5 rounded-[13px] shadow-glow"
          >
            {modalDone ? 'Done' : 'Close'}
          </button>
        )}
      </Modal>
    </AppShell>
  );
}

function TokenPicker({ tokens, onSelect }) {
  return (
    <div className="mt-3 bg-[#0A0A10] border border-white/10 rounded-[14px] overflow-hidden">
      {tokens.map((t) => (
        <button
          key={t.symbol}
          onClick={() => onSelect(t.symbol)}
          disabled={t.disabled}
          className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
            t.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/[0.04]'
          }`}
        >
          <TokenIcon token={t} className="w-8 h-8 rounded-full" />
          <div className="flex-1">
            <div className="text-sm font-bold flex items-center gap-2">
              {t.symbol}
              {t.disabled && <span className="text-[10px] font-semibold text-dim bg-white/5 px-1.5 py-0.5 rounded">Soon</span>}
            </div>
            <div className="text-[11px] text-dim">{t.name}</div>
          </div>
        </button>
      ))}
    </div>
  );
}