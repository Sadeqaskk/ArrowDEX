'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from '../../components/AppShell';
import Modal from '../../components/Modal';
import { useWallet } from '../../lib/WalletContext';
import { getVaultState, stakeTokens, withdrawTokens, claimRewards, exitVault } from '../../lib/vault';
import { VAULT_CONFIG } from '../../lib/vaultConfig';

export default function VaultsPage() {
  const { address, isConnected, connect } = useWallet();

  const [vaultState, setVaultState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [tab, setTab] = useState('stake');
  const [stakeAmount, setStakeAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState('');
  const [modalError, setModalError] = useState(null);
  const [modalDone, setModalDone] = useState(false);
  const [txHash, setTxHash] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await getVaultState(address);
      setVaultState(state);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load vault data.');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  async function runAction(actionFn) {
    setModalOpen(true);
    setModalDone(false);
    setModalError(null);
    setTxHash(null);
    try {
      const hash = await actionFn();
      setTxHash(hash);
      setModalDone(true);
      setStakeAmount('');
      setWithdrawAmount('');
      refresh();
    } catch (err) {
      console.error(err);
      setModalError(err.shortMessage || err.message || 'Transaction failed.');
    }
  }

  return (
    <AppShell>
      <div className="max-w-[620px] mx-auto">
        <div className="mb-6 sm:mb-8 flex items-start justify-between gap-3">
          <div>
            <div className="card-label mb-2">Staking</div>
            <h1 className="text-2xl sm:text-[28px] font-bold">ARROW-LP Vault</h1>
            <p className="text-dim text-sm mt-1.5">
              Live on Arc Testnet — stake your ARROW-LP pool tokens to earn ARROW rewards over time.
            </p>
          </div>
          <button onClick={refresh} disabled={loading} className="text-xs text-indigo-bright font-semibold disabled:opacity-40 flex-shrink-0">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="glass hero-ring p-5 sm:p-7 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <div className="card-label mb-1.5">Total Staked</div>
              <div className="font-mono text-xl font-bold">{vaultState ? parseFloat(vaultState.totalStaked).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}</div>
            </div>
            <div>
              <div className="card-label mb-1.5">Est. APR</div>
              <div className="font-mono text-xl font-bold text-success">
                {vaultState?.aprPct !== null && vaultState?.periodActive ? `${vaultState.aprPct.toFixed(1)}%` : vaultState && !vaultState.periodActive ? 'Ended' : '—'}
              </div>
            </div>
            <div>
              <div className="card-label mb-1.5">Reward Period</div>
              <div className="font-mono text-sm font-bold">
                {vaultState ? (vaultState.periodActive ? `Ends ${vaultState.periodFinishDate.toLocaleDateString()}` : 'Not active') : '—'}
              </div>
            </div>
          </div>

          {isConnected && vaultState && (
            <div className="border-t border-white/5 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-dim">Your staked ARROW-LP</span>
                <span className="font-mono font-bold">{parseFloat(vaultState.userStaked).toFixed(6)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dim">Your unclaimed ARROW</span>
                <span className="font-mono font-bold text-success">{parseFloat(vaultState.earned).toFixed(6)}</span>
              </div>
            </div>
          )}

          {isConnected && vaultState && parseFloat(vaultState.earned) > 0 && (
            <button
              onClick={() => runAction(() => claimRewards({ account: address, onStatus: setModalStatus }))}
              className="w-full mt-5 bg-success/15 text-success font-bold text-sm py-3 rounded-[12px] hover:bg-success/20 transition-colors"
            >
              Claim {parseFloat(vaultState.earned).toFixed(4)} ARROW
            </button>
          )}

          {error && <div className="mt-4 text-sm text-danger">{error}</div>}
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
            <button onClick={connect} className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow">
              Connect Wallet
            </button>
          ) : tab === 'stake' ? (
            <>
              <div className="bg-white/[0.025] border border-white/5 rounded-[16px] p-5 mb-5">
                <div className="flex justify-between text-[11.5px] text-dim mb-3">
                  <span>ARROW-LP to stake</span>
                  <span>
                    Balance: {vaultState ? parseFloat(vaultState.lpBalance).toFixed(6) : '—'}{' '}
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
              <button
                onClick={() => runAction(() => stakeTokens({ account: address, amount: stakeAmount, onStatus: setModalStatus }))}
                disabled={!stakeAmount || parseFloat(stakeAmount) <= 0}
                className="w-full bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-[15px] py-4 rounded-[14px] shadow-glow disabled:opacity-40 disabled:cursor-not-allowed"
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
                    Staked: {vaultState ? parseFloat(vaultState.userStaked).toFixed(6) : '—'}{' '}
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
                  onClick={() => runAction(() => withdrawTokens({ account: address, amount: withdrawAmount, onStatus: setModalStatus }))}
                  disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0}
                  className="flex-1 bg-gradient-to-br from-indigo-bright to-indigo text-white font-bold text-sm sm:text-[15px] py-4 rounded-[14px] shadow-glow disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Withdraw
                </button>
                <button
                  onClick={() => runAction(() => exitVault({ account: address, onStatus: setModalStatus }))}
                  disabled={!vaultState || parseFloat(vaultState.userStaked) <= 0}
                  className="flex-1 border border-white/10 text-ivory font-bold text-sm sm:text-[15px] py-4 rounded-[14px] hover:border-indigo-bright/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Exit All + Claim
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 text-[12px] text-dim leading-relaxed break-all sm:break-normal">
          Vault contract: <a href={`https://testnet.arcscan.app/address/${VAULT_CONFIG.vault.address}`} target="_blank" rel="noreferrer" className="text-indigo-bright font-mono">{VAULT_CONFIG.vault.address.slice(0, 10)}…{VAULT_CONFIG.vault.address.slice(-8)}</a>
          {' '}· No lock period — withdraw anytime. Rewards accrue continuously while staked.
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} closeable={modalDone || !!modalError}>
        <div className="mb-5">
          <div className="card-label mb-2">{modalDone ? 'Complete' : modalError ? 'Failed' : 'In Progress'}</div>
          <h2 className="text-xl font-bold">Vault Transaction</h2>
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
    </AppShell>
  );
}