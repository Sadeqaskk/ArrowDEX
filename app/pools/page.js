'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppShell from '../../components/AppShell';
import Modal from '../../components/Modal';
import { useWallet } from '../../lib/WalletContext';
import { getPoolState, addLiquidity, removeLiquidity, wrapUsdc, unwrapUsdc } from '../../lib/pool';
import { POOL_CONFIG } from '../../lib/poolConfig';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const msg = (err && err.message) || '';
  return msg.includes('request limit reached') || msg.includes('rate limit') || msg.includes('429');
}

export default function PoolsPage() {
  const { address, isConnected, connect } = useWallet();

  const [poolState, setPoolState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const refreshingRef = useRef(false);

  // Liquidity tabs only: 'add' | 'remove'
  const [tab, setTab] = useState('add');
  const [amountWusdc, setAmountWusdc] = useState('');
  const [amountArrow, setAmountArrow] = useState('');
  const [removeAmount, setRemoveAmount] = useState('');

  // Wrap/Unwrap — separate top card, own toggle
  const [wrapTab, setWrapTab] = useState('wrap'); // 'wrap' | 'unwrap'
  const [wrapAmount, setWrapAmount] = useState('');
  const [unwrapAmount, setUnwrapAmount] = useState('');
  const [wrapModalOpen, setWrapModalOpen] = useState(false);
  const [wrapStatus, setWrapStatus] = useState('');
  const [wrapError, setWrapError] = useState(null);
  const [wrapDone, setWrapDone] = useState(false);
  const [wrapTxHash, setWrapTxHash] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
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
        const state = await getPoolState(address);
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
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  const price = poolState && parseFloat(poolState.reserveWusdc) > 0
    ? parseFloat(poolState.reserveArrow) / parseFloat(poolState.reserveWusdc)
    : null;

  const poolShare = poolState && parseFloat(poolState.totalSupply) > 0
    ? (parseFloat(poolState.lpBalance) / parseFloat(poolState.totalSupply)) * 100
    : 0;

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

  async function handleAddLiquidity() {
    setModalOpen(true);
    setModalDone(false);
    setModalError(null);
    setTxHash(null);
    try {
      const hash = await addLiquidity({
        account: address,
        amountWusdc,
        amountArrow,
        onStatus: setModalStatus,
      });
      setTxHash(hash);
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
    setModalDone(false);
    setModalError(null);
    setTxHash(null);
    try {
      const hash = await removeLiquidity({
        account: address,
        lpAmount: removeAmount,
        onStatus: setModalStatus,
      });
      setTxHash(hash);
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
    setWrapDone(false);
    setWrapError(null);
    setWrapTxHash(null);
    try {
      const hash = await wrapUsdc({
        account: address,
        amount: wrapAmount,
        onStatus: setWrapStatus,
      });
      setWrapTxHash(hash);
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
    setWrapDone(false);
    setWrapError(null);
    setWrapTxHash(null);
    try {
      const hash = await unwrapUsdc({
        account: address,
        amount: unwrapAmount,
        onStatus: setWrapStatus,
      });
      setWrapTxHash(hash);
      setWrapDone(true);
      setUnwrapAmount('');
      refresh();
    } catch (err) {
      console.error(err);
      setWrapError(err.shortMessage || err.message || 'Unwrap failed.');
    }
  }

  return (
    <AppShell>
      <div className="max-w-[620px] mx-auto">
        <div className="mb-6 sm:mb-8 flex items-start justify-between gap-3">
          <div>
            <div className="card-label mb-2">Liquidity</div>
            <h1 className="text-2xl sm:text-[28px] font-bold">WUSDC / ARROW Pool</h1>
            <p className="text-dim text-sm mt-1.5">
              Live on Arc Testnet — a real constant-product AMM. Deposit both tokens to earn 0.30% of every trade.
            </p>
          </div>
          <button onClick={refresh} disabled={loading} className="text-xs text-indigo-bright font-semibold disabled:opacity-40 flex-shrink-0">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="glass hero-ring p-5 sm:p-7 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <div className="card-label mb-1.5">WUSDC Reserve</div>
              <div className="font-mono text-xl font-bold">{poolState ? parseFloat(poolState.reserveWusdc).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</div>
            </div>
            <div>
              <div className="card-label mb-1.5">ARROW Reserve</div>
              <div className="font-mono text-xl font-bold">{poolState ? parseFloat(poolState.reserveArrow).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</div>
            </div>
            <div>
              <div className="card-label mb-1.5">Pool Rate</div>
              <div className="font-mono text-xl font-bold text-indigo-bright">{price ? `1:${price.toFixed(2)}` : '—'}</div>
            </div>
          </div>

          {isConnected && poolState && (
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1.5 text-xs text-dim border-t border-white/5 pt-4">
              <span>Your LP tokens: <span className="text-ivory font-mono">{parseFloat(poolState.lpBalance).toFixed(6)}</span></span>
              <span>Your pool share: <span className="text-ivory font-mono">{poolShare.toFixed(4)}%</span></span>
            </div>
          )}

          {error && <div className="mt-4 text-sm text-danger">{error}</div>}
        </div>

        {/* Wrap / Unwrap — its own card at the top, separate from Add/Remove Liquidity */}
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
                    <span>1 USDC = 1 WUSDC</span>
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
                  className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow disabled:opacity-40 disabled:cursor-not-allowed"
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
                    <span>Balance: {poolState ? parseFloat(poolState.wusdcBalance).toFixed(4) : '—'}</span>
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
                  className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow disabled:opacity-40 disabled:cursor-not-allowed"
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
            <button onClick={connect} className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow">
              Connect Wallet
            </button>
          ) : tab === 'add' ? (
            <>
              <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
                <div className="flex justify-between text-[11.5px] text-dim mb-3">
                  <span>WUSDC</span>
                  <span>Balance: {poolState ? parseFloat(poolState.wusdcBalance).toFixed(4) : '—'}</span>
                </div>
                <input
                  type="number"
                  value={amountWusdc}
                  onChange={(e) => handleWusdcChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent font-mono text-2xl outline-none text-ivory"
                />
              </div>
              <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-5">
                <div className="flex justify-between text-[11.5px] text-dim mb-3">
                  <span>ARROW</span>
                  <span>Balance: {poolState ? parseFloat(poolState.arrowBalance).toFixed(4) : '—'}</span>
                </div>
                <input
                  type="number"
                  value={amountArrow}
                  onChange={(e) => handleArrowChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent font-mono text-2xl outline-none text-ivory"
                />
              </div>
              <button
                onClick={handleAddLiquidity}
                disabled={!amountWusdc || !amountArrow || parseFloat(amountWusdc) <= 0}
                className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add Liquidity
              </button>
            </>
          ) : (
            <>
              <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-5">
                <div className="flex justify-between text-[11.5px] text-dim mb-3">
                  <span>LP Tokens to remove</span>
                  <span>
                    Balance: {poolState ? parseFloat(poolState.lpBalance).toFixed(6) : '—'}{' '}
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
              <button
                onClick={handleRemoveLiquidity}
                disabled={!removeAmount || parseFloat(removeAmount) <= 0}
                className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Remove Liquidity
              </button>
            </>
          )}
        </div>

        <div className="mt-6 text-[12px] text-dim leading-relaxed break-all sm:break-normal">
          Pool contract: <a href={`https://testnet.arcscan.app/address/${POOL_CONFIG.pool.address}`} target="_blank" rel="noreferrer" className="text-indigo-bright font-mono">{POOL_CONFIG.pool.address.slice(0, 10)}…{POOL_CONFIG.pool.address.slice(-8)}</a>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} closeable={modalDone || !!modalError}>
        <div className="mb-5">
          <div className="card-label mb-2">{modalDone ? 'Complete' : modalError ? 'Failed' : 'In Progress'}</div>
          <h2 className="text-xl font-bold">{tab === 'add' ? 'Adding Liquidity' : 'Removing Liquidity'}</h2>
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
          <div className="flex items-center gap-3 text-sm text-ivory">
            <span className="w-4 h-4 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin" />
            {wrapStatus}
          </div>
        )}
        {wrapDone && wrapTxHash && (
          <a href={`https://testnet.arcscan.app/tx/${wrapTxHash}`} target="_blank" rel="noreferrer" className="text-indigo-bright text-sm font-mono">
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