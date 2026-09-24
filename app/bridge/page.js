'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import Modal from '../../components/Modal';
import PremiumSelector from '../../components/PremiumSelector';
import { useWallet } from '../../lib/WalletContext';
import { getChainList } from '../../lib/chains';
import { runBridge, completeMint } from '../../lib/cctp';
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
  arcMainnet: 'from-[#8B7FFF] to-[#4d3fc9]',
  ethereumMainnet: 'from-[#4D8AFF] to-[#2f5fc9]',
  baseMainnet: 'from-[#5FE0A8] to-[#2f9e7c]',
};

const CHAIN_LOGOS = {
  arcTestnet: '/fonts/chains/arc.png',
  ethereumSepolia: '/fonts/chains/ethereum.png',
  baseSepolia: '/fonts/chains/base.png',
  arcMainnet: '/fonts/chains/arc.png',
  ethereumMainnet: '/fonts/chains/ethereum.png',
  baseMainnet: '/fonts/chains/base.png',
};

// Default source/dest pair per mode — must be two keys that actually exist
// in that mode's chain list, or sourceChain/destChain below resolve to
// undefined and everything downstream (explorer links, chain.name, etc.)
// breaks. Keep these in sync with lib/chains.js's key names.
const DEFAULT_PAIR = {
  testnet: { source: 'ethereumSepolia', dest: 'arcTestnet' },
  mainnet: { source: 'ethereumMainnet', dest: 'arcMainnet' },
};

// Below this, we treat a destination chain's gas balance as "not enough to mint".
// Mainnet mint gas costs real money and vary by chain, so this is deliberately
// conservative for both modes — it's a trip-wire, not a precise estimate.
const LOW_GAS_THRESHOLD = 0.0005;

// When the source chain's native gas token IS the USDC being bridged (Arc),
// MAX leaves this much behind so there's still something to pay for the burn
// transaction itself.
const ARC_GAS_BUFFER = 0.01;

function fmtBal(v, maxDecimals = 4) {
  if (v === null || v === undefined) return '—';
  const num = parseFloat(v);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString(undefined, { maximumFractionDigits: num < 1 ? 6 : maxDecimals });
}

// Small Testnet ↔ Mainnet pill, same pattern as the dashboard's toggle.
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

export default function BridgePage() {
  const { address, isConnected, connect, networkMode, setNetworkMode } = useWallet();
  const notify = useNotify();

  const chainList = getChainList(networkMode);
  // Keyed lookup for this mode's chains — replaces the old testnet-only
  // `CHAINS` import so sourceChain/destChain always resolve to a chain that
  // actually belongs to the currently selected mode.
  const CHAINS_BY_KEY = Object.fromEntries(chainList.map((c) => [c.key, c]));

  const CHAIN_OPTIONS = chainList.map((c) => ({
    key: c.key,
    label: c.name,
    sublabel: c.nativeIsUsdc ? 'USDC is native gas' : 'USDC + ETH gas',
    colorClass: CHAIN_COLORS[c.key],
    logo: CHAIN_LOGOS[c.key],
    disabled: c.requiresCredentials,
  }));

  const {
    balances,
    loading: balancesLoading,
    error: balancesError,
    refetch: refreshBalances,
  } = useRealBalances(address, networkMode);

  const [sourceKey, setSourceKey] = useState(DEFAULT_PAIR.testnet.source);
  const [destKey, setDestKey] = useState(DEFAULT_PAIR.testnet.dest);
  const [amount, setAmount] = useState('1');

  const [modalOpen, setModalOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [stepStatus, setStepStatus] = useState({});
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [txHashes, setTxHashes] = useState({});
  const [complete, setComplete] = useState(false);
  const [resumeHash, setResumeHash] = useState('');
  const [resuming, setResuming] = useState(false);

  // Switching mode changes the whole set of valid chain keys — reset to that
  // mode's default pair rather than carrying over a key (e.g.
  // 'ethereumSepolia') that doesn't exist in the other mode's list.
  useEffect(() => {
    const pair = DEFAULT_PAIR[networkMode] || DEFAULT_PAIR.testnet;
    setSourceKey(pair.source);
    setDestKey(pair.dest);
    setAmount('1');
  }, [networkMode]);

  const sourceChain = CHAINS_BY_KEY[sourceKey];
  const destChain = CHAINS_BY_KEY[destKey];
  const sourceBalance = balances[sourceKey];
  const destBalance = balances[destKey];

  // Guard against a render where mode just switched and state hasn't caught
  // up yet (see effect above) — avoids sourceChain.name crashing mid-flicker.
  if (!sourceChain || !destChain) {
    return <AppShell><div className="max-w-[560px] mx-auto text-dim text-sm py-10 text-center">Loading chains…</div></AppShell>;
  }

  function flipChains() {
    const s = sourceKey;
    setSourceKey(destKey);
    setDestKey(s);
    setAmount('');
  }

  function setMax() {
    if (!sourceBalance?.usdc) return;
    if (sourceChain.nativeIsUsdc) {
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
    setResuming(false);
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
        // cctp.js needs this to pick Circle's sandbox vs production
        // attestation (Iris) endpoint — a mainnet burn polled against the
        // sandbox API will never get attested.
        networkMode,
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

  // Finish an interrupted bridge: the burn already succeeded on the source
  // chain, so we only fetch the attestation and run the mint.
  async function handleResume() {
    const hash = resumeHash.trim();
    if (!hash) return;

    setError(null);
    setComplete(false);
    setStatusMessage('');
    setResuming(true);
    setStepStatus({ approve: 'done', burn: 'done' });
    setTxHashes({ burn: hash });
    setModalOpen(true);
    setRunning(true);

    try {
      let mintHash = null;
      await completeMint({
        sourceChain,
        destinationChain: destChain,
        account: address,
        burnHash: hash,
        networkMode,
        onStatus: ({ step, status, hash: h, message }) => {
          setStepStatus((prev) => ({ ...prev, [step]: status }));
          if (h) {
            setTxHashes((prev) => ({ ...prev, [step]: h }));
            if (step === 'mint') mintHash = h;
          }
          if (message) setStatusMessage(message);
        },
      });

      setComplete(true);
      setStatusMessage('Mint complete.');
      setResumeHash('');
      notify({
        type: 'bridge',
        title: 'Bridge completed',
        message: `${sourceChain.name} → ${destChain.name}`,
        txHash: mintHash,
      });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Mint failed — see browser console for details.');
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

  const sourceGated = !!sourceChain.requiresCredentials;
  const destGated = !!destChain.requiresCredentials;

  return (
    <AppShell>
      <div className="max-w-[560px] mx-auto">
        <div className="mb-8 flex items-start justify-between gap-3">
          <div>
            <div className="card-label mb-2">Cross-Chain</div>
            <h1 className="text-[28px] font-bold">Bridge USDC</h1>
            <p className="text-dim text-sm mt-1.5">
              Powered by Circle&apos;s CCTP — native burn-and-mint, no wrapped tokens.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <NetworkModeToggle mode={networkMode} onChange={setNetworkMode} />
            {isConnected && (
              <button
                onClick={refreshBalances}
                disabled={balancesLoading}
                className="text-xs text-indigo-bright font-semibold disabled:opacity-40"
              >
                {balancesLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
          </div>
        </div>

        {networkMode === 'mainnet' && (
          <div className="mb-4 text-[12.5px] text-ivory bg-indigo/[0.08] border border-indigo-bright/25 rounded-[12px] px-3.5 py-2.5 leading-relaxed">
            You&apos;re bridging real USDC on Mainnet. CCTP burns are irreversible — double-check the
            source, destination, and amount before confirming in your wallet.
          </div>
        )}

        {balancesError && (
          <div className="mb-4 text-[13px] text-danger bg-danger/10 border border-danger/25 rounded-[12px] px-3.5 py-2.5">
            {balancesError}
          </div>
        )}

        {(sourceGated || destGated) && (
          <div className="mb-4 text-[12.5px] text-dim bg-white/[0.02] border border-white/5 rounded-[12px] px-3.5 py-2.5 leading-relaxed">
            {[sourceGated && sourceChain.name, destGated && destChain.name].filter(Boolean).join(' and ')}{' '}
            {sourceGated && destGated ? 'are' : 'is'} in Circle&apos;s private mainnet phase — bridging
            to/from {sourceGated && destGated ? 'either' : 'that chain'} isn&apos;t available until RPC
            access is granted.
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
              </div>
            )}
          </div>

          {(sourceChain.nativeIsUsdc || destChain.nativeIsUsdc) && (
            <p className="text-[11.5px] text-dim mt-4 leading-relaxed">
              {sourceChain.nativeIsUsdc ? sourceChain.name : destChain.name} uses USDC as its native gas
              token — there&apos;s no separate ERC-20 contract to approve when it&apos;s the source chain.
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
              disabled={!amount || parseFloat(amount) <= 0 || sourceGated || destGated}
              className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start Bridge
            </button>
          )}
        </div>

        {isConnected && (
          <div className="mt-6 bg-white/[0.02] border border-white/5 rounded-[12px] p-4">
            <div className="text-[12px] text-ivory font-semibold mb-2">Finish an interrupted bridge</div>
            <p className="text-[11.5px] text-dim mb-3 leading-relaxed">
              Already burned your USDC but the mint didn&apos;t finish? Select the same source and
              destination chains above, then paste the burn transaction hash from the source chain.
            </p>
            <input
              value={resumeHash}
              onChange={(e) => setResumeHash(e.target.value)}
              placeholder="0x… burn tx hash"
              className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-ivory outline-none mb-3"
            />
            <button
              onClick={handleResume}
              disabled={!resumeHash.trim() || running || sourceGated || destGated}
              className="w-full bg-white/5 border border-white/10 text-ivory font-semibold text-[13px] py-2.5 rounded-[10px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Complete Mint
            </button>
          </div>
        )}

        <div className="mt-6 text-[12px] text-dim leading-relaxed">
          {networkMode === 'mainnet' ? (
            <>
              <strong className="text-ivory">Before you bridge:</strong> you&apos;ll need real USDC and
              native gas on the source chain to approve and burn, <strong className="text-ivory">and</strong>{' '}
              a small amount of native gas on the destination chain to complete the mint. Fast Transfers
              typically attest in under a minute, but always confirm the mint on the destination
              chain&apos;s explorer before assuming funds have arrived.
            </>
          ) : (
            <>
              <strong className="text-ivory">Before you bridge:</strong> you&apos;ll need testnet USDC and
              native gas on the source chain to approve and burn, <strong className="text-ivory">and</strong> a
              small amount of native gas on the destination chain to complete the mint. Get testnet USDC and
              ETH from{' '}
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-indigo-bright">
                faucet.circle.com
              </a>.
              {' '}Fast Transfers typically attest in under a minute.
            </>
          )}
        </div>
      </div>

      {/* BRIDGE PROGRESS MODAL — pops up automatically when Start Bridge is pressed */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} closeable={!running}>
        <div className="mb-6">
          <div className="card-label mb-2">{complete ? 'Complete' : running ? 'In Progress' : 'Bridge'}</div>
          <h2 className="text-xl font-bold">
            {complete
              ? 'Bridge Successful'
              : resuming
              ? 'Finishing your bridge'
              : `Bridging ${amount} USDC`}
          </h2>
          <p className="text-dim text-sm mt-1">
            {sourceChain.name} → {destChain.name}
          </p>
        </div>

        <div className="space-y-4">
          {STEPS.map((s) => {
            const status = stepStatus[s.key];
            // Mint tx lives on the destination chain; every other step is on the source chain.
            const explorer = s.key === 'mint' ? destChain.explorer : sourceChain.explorer;
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
                    href={`${explorer}/tx/${txHashes[s.key]}`}
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