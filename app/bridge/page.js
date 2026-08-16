'use client';

import { useState } from 'react';
import AppShell from '../../components/AppShell';
import Modal from '../../components/Modal';
import PremiumSelector from '../../components/PremiumSelector';
import { useWallet } from '../../lib/WalletContext';
import { CHAINS, CHAIN_LIST } from '../../lib/chains';
import { runBridge } from '../../lib/cctp';
import { useRealBalances } from '../../lib/useBalances';
import { useNotify } from '../../components/NotificationProvider';

const STEPS = [
  { key: 'approve', label: 'Approve USDC' },
  { key: 'burn', label: 'Burn on source chain' },
  { key: 'attestation', label: 'Waiting for Circle attestation' },
  { key: 'mint', label: 'Mint on destination chain' },
];

const CHAIN_COLORS = {
  arcTestnet: 'from-[#8B7FFF] to-[#4d3fc9]',
  ethereumSepolia: 'from-[#4D8AFF] to-[#2f5fc9]',
  baseSepolia: 'from-[#5FE0A8] to-[#2f9e7c]',
};

const CHAIN_LOGOS = {
  arcTestnet: '/fonts/chains/arc.png',
  ethereumSepolia: '/fonts/chains/ethereum.png',
  baseSepolia: '/fonts/chains/base.png',
};

const CHAIN_OPTIONS = CHAIN_LIST.map((c) => ({
  key: c.key,
  label: c.name,
  sublabel: c.key === 'arcTestnet' ? 'USDC is native gas' : 'USDC + ETH gas',
  colorClass: CHAIN_COLORS[c.key],
  logo: CHAIN_LOGOS[c.key],
}));

// Below this, we treat a destination chain's gas balance as "not enough to mint".
// Mints on Sepolia/Base Sepolia are cheap, so this is a conservative trip-wire.
const LOW_GAS_THRESHOLD = 0.0005;

// On Arc, the "USDC" balance IS the native gas balance — bridging 100% of it
// would leave nothing to pay for the burn transaction itself, so MAX leaves
// this much behind.
const ARC_GAS_BUFFER = 0.01;

function fmtBal(v, maxDecimals = 4) {
  if (v === null || v === undefined) return '—';
  const num = parseFloat(v);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString(undefined, { maximumFractionDigits: num < 1 ? 6 : maxDecimals });
}

export default function BridgePage() {
  const { address, isConnected, connect } = useWallet();
  const notify = useNotify();
  const {
    balances,
    loading: balancesLoading,
    error: balancesError,
    refetch: refreshBalances,
  } = useRealBalances(address);

  const [sourceKey, setSourceKey] = useState('ethereumSepolia');
  const [destKey, setDestKey] = useState('arcTestnet');
  const [amount, setAmount] = useState('1');

  const [modalOpen, setModalOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [stepStatus, setStepStatus] = useState({});
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [txHashes, setTxHashes] = useState({});
  const [complete, setComplete] = useState(false);

  const sourceChain = CHAINS[sourceKey];
  const destChain = CHAINS[destKey];
  const sourceBalance = balances[sourceKey];
  const destBalance = balances[destKey];

  function flipChains() {
    const s = sourceKey;
    setSourceKey(destKey);
    setDestKey(s);
    setAmount('');
  }

  function setMax() {
    if (!sourceBalance?.usdc) return;
    if (sourceKey === 'arcTestnet') {
      const avail = Math.max(parseFloat(sourceBalance.usdc) - ARC_GAS_BUFFER, 0);
      setAmount(avail.toString());
    } else {
      setAmount(sourceBalance.usdc);
    }
  }

  function openBridgeModal() {
    setError(null);
    setStepStatus({});
    setTxHashes({});
    setComplete(false);
    setStatusMessage('');
    setModalOpen(true);
    handleBridge();
  }

  async function handleBridge() {
    setRunning(true);
    try {
      const amountSubunits = BigInt(Math.round(parseFloat(amount) * 1_000_000));

      let mintHash = null;
      await runBridge({
        sourceChain,
        destinationChain: destChain,
        account: address,
        amount: amountSubunits,
        onStatus: ({ step, status, hash, message }) => {
          setStepStatus((prev) => ({ ...prev, [step]: status }));
          if (hash) {
            setTxHashes((prev) => ({ ...prev, [step]: hash }));
            if (step === 'mint') mintHash = hash;
          }
          if (message) setStatusMessage(message);
        },
      });

      setComplete(true);
      setStatusMessage('Bridge complete.');
      notify({
        type: 'bridge',
        title: `Bridged ${amount} USDC`,
        message: `${sourceChain.name} → ${destChain.name}`,
        txHash: mintHash,
      });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Bridge failed — see browser console for details.');
    } finally {
      setRunning(false);
      refreshBalances();
    }
  }

  const destGasLow =
    isConnected &&
    destBalance &&
    !destBalance.error &&
    destBalance.native !== null &&
    destBalance.native !== undefined &&
    parseFloat(destBalance.native) < LOW_GAS_THRESHOLD;

  return (
    <AppShell>
      <div className="max-w-[560px] mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="card-label mb-2">Cross-Chain</div>
            <h1 className="text-[28px] font-bold">Bridge USDC</h1>
            <p className="text-dim text-sm mt-1.5">
              Powered by Circle&apos;s CCTP — native burn-and-mint, no wrapped tokens.
            </p>
          </div>
          {isConnected && (
            <button
              onClick={refreshBalances}
              disabled={balancesLoading}
              className="text-xs text-indigo-bright font-semibold disabled:opacity-40 mt-1"
            >
              {balancesLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>

        {balancesError && (
          <div className="mb-4 text-[13px] text-danger bg-danger/10 border border-danger/25 rounded-[12px] px-3.5 py-2.5">
            {balancesError}
          </div>
        )}

        <div className="glass hero-ring p-7">
          <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5">
            <div className="flex justify-between items-center text-[11.5px] text-dim mb-3">
              <span>From</span>
              {isConnected && (
                <span>
                  Balance: {sourceBalance?.error ? '—' : `${fmtBal(sourceBalance?.usdc)} USDC`}
                  <button className="text-indigo-bright font-semibold ml-1.5" onClick={setMax}>
                    MAX
                  </button>
                </span>
              )}
            </div>
            <div className="flex justify-between items-center gap-3">
              <PremiumSelector
                options={CHAIN_OPTIONS}
                value={sourceKey}
                disabledKeys={[destKey]}
                onChange={setSourceKey}
              />
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="bg-transparent text-right font-mono text-2xl outline-none w-full text-ivory"
              />
            </div>
            {isConnected && sourceBalance?.native !== null && sourceBalance?.native !== undefined && (
              <div className="text-right text-[10.5px] text-dim mt-1.5 font-mono">
                {fmtBal(sourceBalance.native, 5)} {sourceBalance.nativeSymbol} for gas
              </div>
            )}
          </div>

          <div className="flex justify-center -my-[18px] relative z-10">
            <button
              onClick={flipChains}
              className="w-11 h-11 rounded-[13px] bg-[#0A0A10] border border-white/10 flex items-center justify-center text-dim hover:text-indigo-bright hover:border-indigo-bright/40 transition-all"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" /></svg>
            </button>
          </div>

          <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5">
            <div className="flex justify-between items-center text-[11.5px] text-dim mb-3">
              <span>To</span>
              {isConnected && (
                <span>Balance: {destBalance?.error ? '—' : `${fmtBal(destBalance?.usdc)} USDC`}</span>
              )}
            </div>
            <div className="flex justify-between items-center gap-3">
              <PremiumSelector
                options={CHAIN_OPTIONS}
                value={destKey}
                disabledKeys={[sourceKey]}
                onChange={setDestKey}
              />
              <div className="font-mono text-2xl text-ivory">{amount || '0.00'}</div>
            </div>
            {isConnected && destBalance?.native !== null && destBalance?.native !== undefined && (
              <div
                className={`text-right text-[10.5px] mt-1.5 font-mono ${destGasLow ? 'text-danger' : 'text-dim'}`}
              >
                {fmtBal(destBalance.native, 5)} {destBalance.nativeSymbol} for gas
                {destGasLow ? ' — may not be enough to complete the mint' : ''}
              </div>
            )}
          </div>

          {(sourceKey === 'arcTestnet' || destKey === 'arcTestnet') && (
            <p className="text-[11.5px] text-dim mt-4 leading-relaxed">
              Arc Testnet uses USDC as its native gas token — there&apos;s no separate ERC-20 contract to approve when Arc is the source chain.
            </p>
          )}

          {destGasLow && (
            <p className="text-[11.5px] text-danger mt-3 leading-relaxed">
              You&apos;re low on {destBalance.nativeSymbol} on {destChain.name}. The final mint step
              runs on {destChain.name} and needs a small amount of its native gas token to complete —
              this is separate from the USDC you&apos;re bridging.
            </p>
          )}

          {!isConnected ? (
            <button
              onClick={connect}
              className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow"
            >
              Connect Wallet to Bridge
            </button>
          ) : (
            <button
              onClick={openBridgeModal}
              disabled={!amount || parseFloat(amount) <= 0}
              className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start Bridge
            </button>
          )}
        </div>

        <div className="mt-6 text-[12px] text-dim leading-relaxed">
          <strong className="text-ivory">Before you bridge:</strong> you&apos;ll need testnet USDC and
          native gas on the source chain to approve and burn, <strong className="text-ivory">and</strong> a
          small amount of native gas on the destination chain to complete the mint. Get testnet USDC and
          ETH from{' '}
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-indigo-bright">
            faucet.circle.com
          </a>.
          {' '}Fast Transfers typically attest in under a minute.
        </div>
      </div>

      {/* BRIDGE PROGRESS MODAL — pops up automatically when Start Bridge is pressed */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} closeable={!running}>
        <div className="mb-6">
          <div className="card-label mb-2">{complete ? 'Complete' : running ? 'In Progress' : 'Bridge'}</div>
          <h2 className="text-xl font-bold">
            {complete ? 'Bridge Successful' : `Bridging ${amount} USDC`}
          </h2>
          <p className="text-dim text-sm mt-1">
            {sourceChain.name} → {destChain.name}
          </p>
        </div>

        <div className="space-y-4">
          {STEPS.map((s) => {
            const status = stepStatus[s.key];
            return (
              <div key={s.key} className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    status === 'done'
                      ? 'bg-success text-black'
                      : status === 'pending'
                      ? 'bg-indigo-bright/30 border border-indigo-bright animate-pulse'
                      : 'bg-white/5 border border-white/10'
                  }`}
                >
                  {status === 'done' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5" /></svg>
                  )}
                </div>
                <span className={`text-sm ${status ? 'text-ivory font-medium' : 'text-dim'}`}>{s.label}</span>
                {txHashes[s.key] && (
                 <a                 
                    href={`${sourceChain.explorer}/tx/${txHashes[s.key]}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-bright ml-auto font-mono"
                  >
                    view →
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {statusMessage && !error && (
          <p className="text-xs text-dim mt-5 font-mono bg-white/[0.02] rounded-lg p-3">{statusMessage}</p>
        )}

        {error && (
          <div className="mt-5 text-[13px] text-danger bg-danger/10 border border-danger/25 rounded-[12px] p-3.5">
            {error}
          </div>
        )}

        {(complete || error) && (
          <button
            onClick={() => setModalOpen(false)}
            className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14px] py-3.5 rounded-[13px] shadow-glow"
          >
            {complete ? 'Done' : 'Close'}
          </button>
        )}
      </Modal>
    </AppShell>
  );
}