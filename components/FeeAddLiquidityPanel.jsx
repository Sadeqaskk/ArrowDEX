'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatUnits } from 'viem';
import Modal from './Modal';
import { useNotify } from './NotificationProvider';
import { getV4PoolState } from '../lib/uniV4Pools';
import { readRouterFeeBps, previewAdd, addLiquidityWithFee } from '../lib/arrowFeeRouter';

const fmt = (n, max = 4) => {
  const v = parseFloat(n);
  return Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: max }) : '—';
};

const BTN =
  'w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed';

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 text-[11.5px] text-dim">
      <span>{label}</span>
      <span className="font-mono text-ivory/80 text-right">{value}</span>
    </div>
  );
}

/**
 * Mainnet "Add Liquidity" tab. Deposits go through ArrowDexFeeRouter, which takes the fee
 * from both tokens and mints a full-range Uniswap v4 position to the user's wallet.
 *
 * Props: poolCfg (activeV4Pool), poolState (v4PoolState), price (v4Price: token1 per token0),
 * address, onRefresh, onMinted({tokenId, liquidity, tickLower, tickUpper}), explorerTx(hash).
 */
export default function FeeAddLiquidityPanel({ poolCfg, poolState, price, address, onRefresh, onMinted, explorerTx }) {
  const notify = useNotify();
  const [a0, setA0] = useState('');
  const [a1, setA1] = useState('');
  const [feeBps, setFeeBps] = useState(null);
  const [feeError, setFeeError] = useState(false);
  const [m, setM] = useState({ open: false, status: '', error: null, done: false, hash: null, tokenId: null });

  const c0 = poolCfg.currency0;
  const c1 = poolCfg.currency1;

  useEffect(() => { setA0(''); setA1(''); }, [poolCfg.key]);

  useEffect(() => {
    let dead = false;
    readRouterFeeBps()
      .then((v) => { if (!dead) { setFeeBps(v); setFeeError(false); } })
      .catch((e) => { console.error('Fee router read failed:', e); if (!dead) setFeeError(true); });
    return () => { dead = true; };
  }, []);

  // Keep the two sides at the pool's ratio: any excess of one token would not be deposited.
  function change0(v) {
    setA0(v);
    const x = parseFloat(v);
    if (!v) setA1('');
    else if (price && x > 0) setA1((x * price).toFixed(Math.min(c1.decimals, 8)));
  }
  function change1(v) {
    setA1(v);
    const x = parseFloat(v);
    if (!v) setA0('');
    else if (price && x > 0) setA0((x / price).toFixed(Math.min(c0.decimals, 8)));
  }

  const preview = useMemo(
    () => (feeBps == null ? null : previewAdd({ poolCfg, amount0: a0, amount1: a1, feeBps })),
    [poolCfg, a0, a1, feeBps]
  );

  const bal0 = poolState ? parseFloat(poolState.balance0) : null;
  const bal1 = poolState ? parseFloat(poolState.balance1) : null;
  const insufficient = (bal0 != null && parseFloat(a0) > bal0) || (bal1 != null && parseFloat(a1) > bal1);
  const ready = !!preview && !insufficient && !feeError && poolState?.initialized !== false;
  const feePct = feeBps != null ? `${(feeBps / 100).toFixed(2)}%` : '—';

  async function handleAdd() {
    setM({ open: true, status: 'Preparing…', error: null, done: false, hash: null, tokenId: null });
    try {
      // Re-read the price right before sending so the liquidity maths matches the pool.
      const fresh = await getV4PoolState(poolCfg, address);
      if (!fresh?.initialized) throw new Error('This pool is not initialized yet.');

      const r = await addLiquidityWithFee({
        account: address,
        poolCfg,
        amount0: a0,
        amount1: a1,
        sqrtPriceX96: fresh.sqrtPriceX96,
        onStatus: (status) => setM((s) => ({ ...s, status })),
      });

      setM((s) => ({ ...s, done: true, hash: r.hash, tokenId: r.tokenId }));
      // No txHash on purpose: the shared notification may build testnet explorer links.
      notify({
        type: 'addLiquidity',
        title: 'Added Liquidity',
        message: `${a0} ${c0.symbol} + ${a1} ${c1.symbol} deposited${r.tokenId != null ? ` · position #${r.tokenId}` : ''}`,
      });
      onMinted?.(r);
      setA0('');
      setA1('');
      onRefresh?.();
    } catch (err) {
      console.error(err);
      setM((s) => ({ ...s, error: err.shortMessage || err.message || 'Transaction failed.' }));
    }
  }

  return (
    <>
      <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
        <div className="flex justify-between text-[11.5px] text-dim mb-3">
          <span>{c0.symbol}</span>
          <span>Balance: {poolState ? fmt(poolState.balance0, c0.decimals === 8 ? 8 : 4) : '—'}</span>
        </div>
        <input type="number" value={a0} onChange={(e) => change0(e.target.value)} placeholder="0.00" className="w-full bg-transparent font-mono text-2xl outline-none text-ivory" />
      </div>

      <div className="flex justify-center -my-1 relative z-10">
        <span className="w-7 h-7 rounded-full bg-[#0A0A10] border border-white/10 flex items-center justify-center text-dim">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
        </span>
      </div>

      <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-5">
        <div className="flex justify-between text-[11.5px] text-dim mb-3">
          <span>{c1.symbol}</span>
          <span>Balance: {poolState ? fmt(poolState.balance1, c1.decimals === 8 ? 8 : 4) : '—'}</span>
        </div>
        <input type="number" value={a1} onChange={(e) => change1(e.target.value)} placeholder="0.00" className="w-full bg-transparent font-mono text-2xl outline-none text-ivory" />
      </div>

      {feeError && (
        <div className="mb-4 text-[13px] text-danger bg-danger/[0.06] border border-danger/20 rounded-[12px] px-3.5 py-2.5">
          Couldn't reach the ArrowDEX fee router. Adding liquidity is paused.
        </div>
      )}

      <div className="bg-white/[0.02] border border-white/5 rounded-[14px] p-4 mb-5 space-y-2">
        <Row
          label={`ArrowDEX fee (${feePct})`}
          value={preview ? `${fmt(formatUnits(preview.fee0, c0.decimals), 6)} ${c0.symbol} + ${fmt(formatUnits(preview.fee1, c1.decimals), 6)} ${c1.symbol}` : '—'}
        />
        <Row
          label="Deposited to pool"
          value={preview ? `${fmt(formatUnits(preview.net0, c0.decimals), 6)} ${c0.symbol} + ${fmt(formatUnits(preview.net1, c1.decimals), 6)} ${c1.symbol}` : '—'}
        />
        <Row label="Position" value="Full range · NFT sent to your wallet" />
      </div>

      <p className="text-[11.5px] text-dim leading-relaxed mb-4">
        The fee is taken from both tokens when you deposit. Removing liquidity is free. Keep the Token ID shown after
        the deposit — you need it to remove this position.
      </p>

      <button onClick={handleAdd} disabled={!ready} className={BTN}>
        {insufficient ? 'Insufficient Balance' : 'Add Liquidity'}
      </button>

      <Modal open={m.open} onClose={() => setM((s) => ({ ...s, open: false }))} closeable={m.done || !!m.error}>
        <div className="mb-5">
          <div className="card-label mb-2">{m.done ? 'Complete' : m.error ? 'Failed' : 'In Progress'}</div>
          <h2 className="text-xl font-bold">{m.done ? 'Liquidity Added' : 'Adding Liquidity'}</h2>
          <p className="text-dim text-sm mt-1">{poolCfg.label} via ArrowDEX · {feePct} fee</p>
        </div>

        {!m.done && !m.error && (
          <div className="flex items-center gap-3 text-sm text-ivory">
            <span className="w-4 h-4 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin flex-shrink-0" />
            {m.status}
          </div>
        )}

        {m.done && (
          <div className="space-y-2">
            {m.tokenId != null && (
              <div className="text-sm text-ivory">
                Position Token ID: <span className="font-mono font-bold">{String(m.tokenId)}</span>
              </div>
            )}
            {m.hash && (
              <a href={explorerTx(m.hash)} target="_blank" rel="noreferrer" className="text-indigo-bright text-sm font-mono">
                View transaction →
              </a>
            )}
          </div>
        )}

        {m.error && <div className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-[12px] p-3.5">{m.error}</div>}

        {(m.done || m.error) && (
          <button onClick={() => setM((s) => ({ ...s, open: false }))} className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14px] py-3.5 rounded-[13px] shadow-glow">
            Close
          </button>
        )}
      </Modal>
    </>
  );
}