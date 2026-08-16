'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AppShell from '../../components/AppShell';
import Modal from '../../components/Modal';
import { useWallet } from '../../lib/WalletContext';
import { getVaultState, stakeTokens, withdrawTokens, claimRewards, exitVault, fundAndStartRewards } from '../../lib/vault';
import { VAULT_CONFIG } from '../../lib/vaultConfig';
import { useNotify } from '../../components/NotificationProvider';

const EXPLORER_TX = (hash) => `https://testnet.arcscan.app/tx/${hash}`;
const EXPLORER_ADDR = (addr) => `https://testnet.arcscan.app/address/${addr}`;
const YEAR_SECONDS = 365 * 86400;

function fmt(n, max = 4) {
  const v = parseFloat(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString(undefined, { maximumFractionDigits: max });
}

// Same mark used on Swap and Pools so every contract in the app reads as
// one protocol.
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

function StepModal({ open, onClose, title, step, status, error, done, txHash, closeLabel = 'Close' }) {
  return (
    <Modal open={open} onClose={onClose} closeable={done || !!error}>
      <div className="mb-5">
        <div className="card-label mb-2">{done ? 'Complete' : error ? 'Failed' : 'In Progress'}</div>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      {!done && !error && (
        <div className="space-y-3">
          {['Confirm in wallet', 'Submitting to Arc', 'Waiting for confirmation'].map((label, i) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              {i < step ? (
                <span className="w-4 h-4 rounded-full bg-success/20 text-success flex items-center justify-center text-[10px]">✓</span>
              ) : i === step ? (
                <span className="w-4 h-4 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin flex-shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full border border-white/10 flex-shrink-0" />
              )}
              <span className={i <= step ? 'text-ivory' : 'text-dim'}>{i === step ? (status || label) : label}</span>
            </div>
          ))}
        </div>
      )}
      {done && txHash && (
        <a href={EXPLORER_TX(txHash)} target="_blank" rel="noreferrer" className="text-indigo-bright text-sm font-mono">
          View transaction →
        </a>
      )}
      {error && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-[12px] p-3.5">{error}</div>
      )}
      {(done || error) && (
        <button onClick={onClose} className="w-full mt-6 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[14px] py-3.5 rounded-[13px] shadow-glow">
          {closeLabel}
        </button>
      )}
    </Modal>
  );
}

function useCountdown(targetDate) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!targetDate) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  if (!targetDate) return null;
  const diff = Math.max(0, targetDate.getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { diff, d, h, m, s };
}

export default function VaultsPage() {
  const { address, isConnected, connect } = useWallet();
  const notify = useNotify();

  const [vaultState, setVaultState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchedAtRef = useRef(null);

  const [tab, setTab] = useState('stake');
  const [stakeAmount, setStakeAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const [rewardAmount, setRewardAmount] = useState('');
  const [rewardDurationDays, setRewardDurationDays] = useState('7');
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminStep, setAdminStep] = useState(0);
  const [adminStatus, setAdminStatus] = useState('');
  const [adminError, setAdminError] = useState(null);
  const [adminDone, setAdminDone] = useState(false);
  const [adminTxHash, setAdminTxHash] = useState(null);

  const [engineOpen, setEngineOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(0);
  const [modalTitle, setModalTitle] = useState('Vault Transaction');
  const [modalStatus, setModalStatus] = useState('');
  const [modalError, setModalError] = useState(null);
  const [modalDone, setModalDone] = useState(false);
  const [txHash, setTxHash] = useState(null);

  // A ticking clock, independent of vaultState, that drives the live
  // "earned so far" extrapolation between refreshes.
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await getVaultState(address);
      setVaultState(state);
      fetchedAtRef.current = Date.now();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load vault data.');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  const isOwner = isConnected && vaultState?.owner && address &&
    vaultState.owner.toLowerCase() === address.toLowerCase();

  const userStaked = vaultState ? parseFloat(vaultState.userStaked) : 0;
  const totalStaked = vaultState ? parseFloat(vaultState.totalStaked) : 0;
  const earnedAtFetch = vaultState ? parseFloat(vaultState.earned) : 0;
  const stakeShare = totalStaked > 0 ? (userStaked / totalStaked) * 100 : 0;

  // APR communicates "your stake earns APR% annually" — so the per-second
  // accrual rate for this user is a direct, non-fabricated consequence of
  // that number, not an invented figure. Used only to animate the live
  // counter between refetches; the real value is whatever the next
  // refresh/claim confirms on-chain.
  const perSecondRate = vaultState?.periodActive && vaultState?.aprPct != null
    ? (userStaked * (vaultState.aprPct / 100)) / YEAR_SECONDS
    : 0;

  const liveEarned = useMemo(() => {
    if (!fetchedAtRef.current || !vaultState?.periodActive) return earnedAtFetch;
    const elapsed = (tick - fetchedAtRef.current) / 1000;
    return earnedAtFetch + Math.max(0, elapsed) * perSecondRate;
  }, [tick, earnedAtFetch, perSecondRate, vaultState?.periodActive]);

  const dailyEstimate = perSecondRate * 86400;
  const weeklyEstimate = perSecondRate * 86400 * 7;

  const countdown = useCountdown(vaultState?.periodActive ? vaultState.periodFinishDate : null);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(VAULT_CONFIG.vault.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — ignore */ }
  }

  async function runAction(actionFn, title, notifyPayload) {
    setModalTitle(title);
    setModalOpen(true);
    setModalStep(0);
    setModalDone(false);
    setModalError(null);
    setTxHash(null);
    try {
      setModalStep(1);
      const hash = await actionFn();
      setTxHash(hash);
      if (notifyPayload) {
        notify({ ...notifyPayload, txHash: hash });
      }
      setModalStep(2);
      setModalDone(true);
      setStakeAmount('');
      setWithdrawAmount('');
      refresh();
    } catch (err) {
      console.error(err);
      setModalError(err.shortMessage || err.message || 'Transaction failed.');
    }
  }

  async function handleFundAndStartRewards() {
    setAdminModalOpen(true);
    setAdminStep(0);
    setAdminDone(false);
    setAdminError(null);
    setAdminTxHash(null);
    try {
      setAdminStep(1);
      const hash = await fundAndStartRewards({
        account: address,
        amount: rewardAmount,
        durationSeconds: parseFloat(rewardDurationDays) * 86400,
        onStatus: setAdminStatus,
      });
      setAdminTxHash(hash);
      notify({
        type: 'claim',
        title: 'Reward Period Started',
        message: `${rewardAmount} ARROW over ${rewardDurationDays} days`,
        txHash: hash,
      });
      setAdminStep(2);
      setAdminDone(true);
      setRewardAmount('');
      refresh();
    } catch (err) {
      console.error(err);
      setAdminError(err.shortMessage || err.message || 'Failed to start new reward period.');
    }
  }

  const shareDonut = totalStaked > 0
    ? `conic-gradient(#8B7FFF 0% ${stakeShare}%, rgba(255,255,255,0.06) ${stakeShare}% 100%)`
    : 'conic-gradient(rgba(255,255,255,0.06) 0% 100%)';

  return (
    <AppShell>
      <div className="max-w-[620px] mx-auto">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="card-label mb-2 flex items-center gap-1.5"><LivePulse ok={!error} /> Staking</div>
            <h1 className="text-2xl sm:text-[28px] font-bold">ARROW-LP Vault</h1>
            <p className="text-dim text-sm mt-1.5">
              Stake ARROW-LP pool tokens to earn ARROW rewards over time. No lock period.
            </p>
          </div>
          <button onClick={refresh} disabled={loading} className="text-xs text-indigo-bright font-semibold disabled:opacity-40 flex-shrink-0">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Contract badge — same pattern as Swap / Pools */}
        <div className="relative mb-5">
          <button
            onClick={() => setEngineOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 bg-white/[0.025] border border-white/5 hover:border-indigo-bright/30 transition-colors rounded-[14px] px-4 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <EngineLogo className="w-6 h-6" />
              <div className="text-left">
                <div className="text-[13px] font-bold flex items-center gap-1.5">
                  Powered by ArrowVault Engine
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-indigo-bright">
                    <path fillRule="evenodd" d="M10 1.5l2.163 1.44 2.59-.2 1.02 2.393 2.393 1.02-.2 2.59L19.5 10l-1.44 2.163.2 2.59-2.393 1.02-1.02 2.393-2.59-.2L10 19.5l-2.163-1.44-2.59.2-1.02-2.393-2.393-1.02.2-2.59L.5 10l1.44-2.163-.2-2.59 2.393-1.02 1.02-2.393 2.59.2L10 1.5zm3.03 6.28a.75.75 0 00-1.06-1.06L8.5 10.19l-1.47-1.47a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l3.5-3.5z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-[11px] text-dim">Synthetix-style reward streaming · no lock</div>
              </div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 text-dim transition-transform ${engineOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {engineOpen && (
            <div className="absolute z-20 mt-2 w-full bg-[#0A0A10] border border-white/10 rounded-[14px] p-4 shadow-xl">
              <div className="text-[11px] text-dim mb-1.5">Vault contract address</div>
              <div className="flex items-center gap-2 bg-white/[0.03] rounded-[10px] px-3 py-2">
                <span className="font-mono text-[12px] text-ivory truncate flex-1">
                  {VAULT_CONFIG.vault.address.slice(0, 10)}…{VAULT_CONFIG.vault.address.slice(-8)}
                </span>
                <button onClick={copyAddress} className="text-indigo-bright text-[11px] font-semibold flex-shrink-0">{copied ? 'Copied' : 'Copy'}</button>
                <a href={EXPLORER_ADDR(VAULT_CONFIG.vault.address)} target="_blank" rel="noreferrer" className="text-indigo-bright text-[11px] font-semibold flex-shrink-0">View ↗</a>
              </div>
            </div>
          )}
        </div>

        {/* Vault stats */}
        <div className="glass hero-ring p-5 sm:p-7 mb-5 relative overflow-hidden">
          <div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(139,127,255,0.12), transparent 70%)' }}
          />
          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <div className="card-label mb-1.5">Total Staked</div>
              <div className="font-mono text-xl font-bold">{vaultState ? fmt(totalStaked) : '—'}</div>
            </div>
            <div>
              <div className="card-label mb-1.5">Est. APR</div>
              <div className="font-mono text-xl font-bold text-success">
                {vaultState?.aprPct != null && vaultState?.periodActive ? `${vaultState.aprPct.toFixed(1)}%` : vaultState && !vaultState.periodActive ? 'Ended' : '—'}
              </div>
            </div>
            <div>
              <div className="card-label mb-1.5">Reward Period</div>
              {vaultState?.periodActive && countdown ? (
                <div className="font-mono text-sm font-bold flex items-center gap-1.5">
                  <LivePulse ok />
                  {countdown.d > 0 ? `${countdown.d}d ` : ''}{String(countdown.h).padStart(2, '0')}:{String(countdown.m).padStart(2, '0')}:{String(countdown.s).padStart(2, '0')}
                </div>
              ) : (
                <div className="font-mono text-sm font-bold">{vaultState ? 'Not active' : '—'}</div>
              )}
            </div>
          </div>

          {isConnected && vaultState && (
            <div className="relative border-t border-white/5 pt-5 flex flex-col sm:flex-row gap-6">
              <div className="flex-shrink-0 flex items-center gap-4">
                <div className="relative w-[72px] h-[72px] flex-shrink-0">
                  <div className="w-full h-full rounded-full transition-all duration-700" style={{ background: shareDonut }} />
                  <div className="absolute inset-[7px] rounded-full bg-[#0A0A10] flex flex-col items-center justify-center">
                    <div className="font-mono text-[11px] font-bold text-indigo-bright">{stakeShare.toFixed(1)}%</div>
                  </div>
                </div>
                <div className="text-[11px] text-dim">of total<br />vault stake</div>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-dim">Your staked ARROW-LP</span>
                  <span className="font-mono font-bold">{fmt(userStaked, 6)}</span>
                </div>
                <div className="flex justify-between text-sm items-baseline">
                  <span className="text-dim flex items-center gap-1.5">
                    Your unclaimed ARROW
                    {vaultState.periodActive && perSecondRate > 0 && <LivePulse ok />}
                  </span>
                  <span className="font-mono font-bold text-success tabular-nums">{fmt(liveEarned, 6)}</span>
                </div>
                {perSecondRate > 0 && vaultState.periodActive && (
                  <div className="flex justify-between text-[11px] text-dim">
                    <span>Est. accrual</span>
                    <span className="font-mono">+{fmt(dailyEstimate, 5)}/day · +{fmt(weeklyEstimate, 4)}/wk</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {isConnected && vaultState && liveEarned > 0 && (
            <button
              onClick={() => runAction(
                () => claimRewards({ account: address, onStatus: setModalStatus }),
                'Claiming Rewards',
                { type: 'claim', title: `Claimed ${fmt(liveEarned)} ARROW`, message: 'Rewards sent to your wallet' }
              )}
              className="relative w-full mt-5 bg-success/15 text-success font-bold text-sm py-3 rounded-[12px] hover:bg-success/20 transition-colors"
            >
              Claim {fmt(liveEarned)} ARROW
            </button>
          )}

          {error && <div className="relative mt-4 text-sm text-danger">{error}</div>}
        </div>

        <div className="glass p-5 sm:p-7">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab('stake')}
              className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-colors ${tab === 'stake' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory'}`}
            >
              Stake
            </button>
            <button
              onClick={() => setTab('withdraw')}
              className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-colors ${tab === 'withdraw' ? 'bg-indigo/15 text-indigo-bright' : 'text-dim hover:text-ivory'}`}
            >
              Withdraw
            </button>
          </div>

          {!isConnected ? (
            <button onClick={connect} className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform">
              Connect Wallet
            </button>
          ) : tab === 'stake' ? (
            <>
              <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
                <div className="flex justify-between text-[11.5px] text-dim mb-3">
                  <span>ARROW-LP to stake</span>
                  <span>
                    Balance: {vaultState ? fmt(vaultState.lpBalance, 6) : '—'}{' '}
                    <button className="text-indigo-bright font-semibold ml-1" onClick={() => setStakeAmount(vaultState?.lpBalance || '')}>MAX</button>
                  </span>
                </div>
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent font-mono text-2xl outline-none text-ivory"
                />
              </div>
              {stakeAmount && parseFloat(stakeAmount) > 0 && vaultState?.aprPct != null && vaultState?.periodActive && (
                <div className="flex justify-between text-xs text-dim mb-5 px-1">
                  <span>Projected earnings</span>
                  <span className="font-mono text-ivory/80">
                    ≈ {fmt((parseFloat(stakeAmount) * vaultState.aprPct / 100) / 365, 5)} ARROW/day
                  </span>
                </div>
              )}
              <button
                onClick={() => runAction(
                  () => stakeTokens({ account: address, amount: stakeAmount, onStatus: setModalStatus }),
                  'Staking ARROW-LP',
                  { type: 'stake', title: `Staked ${stakeAmount} ARROW-LP`, message: 'Now earning vault rewards' }
                )}
                disabled={!stakeAmount || parseFloat(stakeAmount) <= 0}
                className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Stake
              </button>
            </>
          ) : (
            <>
              <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-5">
                <div className="flex justify-between text-[11.5px] text-dim mb-3">
                  <span>ARROW-LP to withdraw</span>
                  <span>
                    Staked: {vaultState ? fmt(vaultState.userStaked, 6) : '—'}{' '}
                    <button className="text-indigo-bright font-semibold ml-1" onClick={() => setWithdrawAmount(vaultState?.userStaked || '')}>MAX</button>
                  </span>
                </div>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent font-mono text-2xl outline-none text-ivory"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={() => runAction(
                    () => withdrawTokens({ account: address, amount: withdrawAmount, onStatus: setModalStatus }),
                    'Withdrawing ARROW-LP',
                    { type: 'withdraw', title: `Withdrew ${withdrawAmount} ARROW-LP`, message: 'Returned to your wallet' }
                  )}
                  disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0}
                  className="flex-1 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-sm sm:text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Withdraw
                </button>
                <button
                  onClick={() => runAction(
                    () => exitVault({ account: address, onStatus: setModalStatus }),
                    'Exiting Vault',
                    { type: 'exit', title: 'Exited Vault', message: 'Withdrew stake and claimed rewards' }
                  )}
                  disabled={!vaultState || parseFloat(vaultState.userStaked) <= 0}
                  className="flex-1 border border-white/10 text-ivory font-bold text-sm sm:text-[15px] py-4 rounded-[14px] hover:border-indigo-bright/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Exit All + Claim
                </button>
              </div>
            </>
          )}
        </div>

        {isOwner && (
          <div className="glass p-5 sm:p-7 mt-5 border border-indigo-bright/20">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="text-[11.5px] text-dim">Admin — restart reward period</div>
              <span className="text-[10px] uppercase tracking-wide text-indigo-bright font-semibold bg-indigo-bright/10 px-2 py-0.5 rounded-full">Owner only</span>
            </div>
            <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
              <div className="flex justify-between text-[11.5px] text-dim mb-3">
                <span>ARROW to fund as new rewards</span>
              </div>
              <input
                type="number"
                value={rewardAmount}
                onChange={(e) => setRewardAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent font-mono text-2xl outline-none text-ivory"
              />
            </div>
            <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-3">
              <div className="flex justify-between text-[11.5px] text-dim mb-3">
                <span>Duration (days)</span>
              </div>
              <input
                type="number"
                value={rewardDurationDays}
                onChange={(e) => setRewardDurationDays(e.target.value)}
                placeholder="7"
                className="w-full bg-transparent font-mono text-2xl outline-none text-ivory"
              />
            </div>
            {rewardAmount && parseFloat(rewardAmount) > 0 && rewardDurationDays && parseFloat(rewardDurationDays) > 0 && (
              <div className="flex justify-between text-xs text-dim mb-3 px-1">
                <span>Implied rate</span>
                <span className="font-mono text-ivory/80">{fmt(parseFloat(rewardAmount) / parseFloat(rewardDurationDays), 4)} ARROW/day pool-wide</span>
              </div>
            )}
            <button
              onClick={handleFundAndStartRewards}
              disabled={!rewardAmount || parseFloat(rewardAmount) <= 0 || !rewardDurationDays || parseFloat(rewardDurationDays) <= 0}
              className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow hover:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Fund &amp; Start New Reward Period
            </button>
            <p className="text-[11.5px] text-dim leading-relaxed mt-3">
              Transfers ARROW into the vault, then sets a new reward rate of (amount ÷ duration) starting now.
            </p>
          </div>
        )}
      </div>

      <StepModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        step={modalStep}
        status={modalStatus}
        error={modalError}
        done={modalDone}
        txHash={txHash}
      />
      <StepModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        title="Restarting Reward Period"
        step={adminStep}
        status={adminStatus}
        error={adminError}
        done={adminDone}
        txHash={adminTxHash}
      />
    </AppShell>
  );
}