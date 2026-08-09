import { createPublicClient, createWalletClient, custom, http, formatUnits, parseUnits, defineChain } from 'viem';
import { CHAINS } from './chains';
import { ERC20_ABI } from './poolConfig';
import { VAULT_CONFIG, ARROW_VAULT_ABI } from './vaultConfig';
import { getActiveProvider } from './activeProvider';

const arc = CHAINS.arcTestnet;

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

const arcViemChain = defineChain({
  id: arc.chainId,
  name: arc.name,
  nativeCurrency: arc.nativeCurrency,
  rpcUrls: { default: { http: [arc.rpcUrl] } },
  blockExplorers: arc.explorer ? { default: { name: `${arc.name} Explorer`, url: arc.explorer } } : undefined,
});

let _publicClient = null;
function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain: arcViemChain, transport: http(arc.rpcUrl) });
  }
  return _publicClient;
}

function getWalletClient() {
  const provider = getActiveProvider();
  if (!provider) {
    throw new Error('No wallet connected.');
  }
  return createWalletClient({ chain: arcViemChain, transport: custom(provider) });
}

async function ensureArcNetwork() {
  const provider = getActiveProvider();
  if (!provider) throw new Error('No wallet connected.');
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: arc.chainIdHex }] });
  } catch (err) {
    if (err.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: arc.chainIdHex, chainName: arc.name, nativeCurrency: arc.nativeCurrency,
          rpcUrls: [arc.rpcUrl], blockExplorerUrls: [arc.explorer],
        }],
      });
    } else {
      throw err;
    }
  }
}

export async function getVaultState(userAddress) {
  const client = getPublicClient();
  const hasUser = !!userAddress;
  const account = hasUser ? userAddress : '0x0000000000000000000000000000000000000000';

  const results = await client.multicall({
    multicallAddress: MULTICALL3_ADDRESS,
    contracts: [
      { address: VAULT_CONFIG.vault.address, abi: ARROW_VAULT_ABI, functionName: 'totalSupply' },
      { address: VAULT_CONFIG.vault.address, abi: ARROW_VAULT_ABI, functionName: 'balanceOf', args: [account] },
      { address: VAULT_CONFIG.vault.address, abi: ARROW_VAULT_ABI, functionName: 'earned', args: [account] },
      { address: VAULT_CONFIG.vault.address, abi: ARROW_VAULT_ABI, functionName: 'rewardRate' },
      { address: VAULT_CONFIG.vault.address, abi: ARROW_VAULT_ABI, functionName: 'periodFinish' },
      { address: VAULT_CONFIG.vault.address, abi: ARROW_VAULT_ABI, functionName: 'owner' },
      { address: VAULT_CONFIG.stakingToken.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] },
    ],
  });

  const [totalSupplyR, userStakedR, earnedR, rewardRateR, periodFinishR, ownerR, lpBalanceR] = results;

  if (totalSupplyR.status !== 'success' || rewardRateR.status !== 'success' || periodFinishR.status !== 'success') {
    throw new Error('Failed to read vault state.');
  }

  const totalStaked = totalSupplyR.result;
  const rewardRate = rewardRateR.result;
  const periodFinish = periodFinishR.result;
  const owner = ownerR.status === 'success' ? ownerR.result : null;

  const userStaked = hasUser && userStakedR.status === 'success' ? userStakedR.result : 0n;
  const earned = hasUser && earnedR.status === 'success' ? earnedR.result : 0n;
  const lpBalance = hasUser && lpBalanceR.status === 'success' ? lpBalanceR.result : 0n;

  const SECONDS_PER_YEAR = 31_536_000n;
  let aprPct = null;
  if (totalStaked > 0n) {
    const annualRewards = rewardRate * SECONDS_PER_YEAR;
    aprPct = (Number(formatUnits(annualRewards, 18)) / Number(formatUnits(totalStaked, 18))) * 100;
  }

  const periodActive = Number(periodFinish) * 1000 > Date.now();

  return {
    totalStaked: formatUnits(totalStaked, 18),
    userStaked: formatUnits(userStaked, 18),
    userStakedRaw: userStaked,
    earned: formatUnits(earned, 18),
    lpBalance: formatUnits(lpBalance, 18),
    aprPct,
    periodActive,
    periodFinishDate: new Date(Number(periodFinish) * 1000),
    owner,
  };
}

async function approveIfNeeded(account, amount) {
  const publicClient = getPublicClient();
  const currentAllowance = await publicClient.readContract({
    address: VAULT_CONFIG.stakingToken.address, abi: ERC20_ABI, functionName: 'allowance',
    args: [account, VAULT_CONFIG.vault.address],
  });

  if (currentAllowance >= amount) return null;

  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: VAULT_CONFIG.stakingToken.address, abi: ERC20_ABI, functionName: 'approve',
    args: [VAULT_CONFIG.vault.address, amount],
  });
  await getPublicClient().waitForTransactionReceipt({ hash });
  return hash;
}

export async function stakeTokens({ account, amount, onStatus }) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();
  const amountRaw = parseUnits(amount, 18);

  onStatus?.('Checking approval…');
  await approveIfNeeded(account, amountRaw);

  onStatus?.('Staking…');
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: VAULT_CONFIG.vault.address, abi: ARROW_VAULT_ABI, functionName: 'stake',
    args: [amountRaw],
  });
  await getPublicClient().waitForTransactionReceipt({ hash });
  return hash;
}

export async function withdrawTokens({ account, amount, onStatus }) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();
  const amountRaw = parseUnits(amount, 18);

  onStatus?.('Withdrawing…');
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: VAULT_CONFIG.vault.address, abi: ARROW_VAULT_ABI, functionName: 'withdraw',
    args: [amountRaw],
  });
  await getPublicClient().waitForTransactionReceipt({ hash });
  return hash;
}

export async function claimRewards({ account, onStatus }) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();

  onStatus?.('Claiming rewards…');
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: VAULT_CONFIG.vault.address, abi: ARROW_VAULT_ABI, functionName: 'getReward',
    args: [],
  });
  await getPublicClient().waitForTransactionReceipt({ hash });
  return hash;
}

export async function exitVault({ account, onStatus }) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();

  onStatus?.('Exiting vault (withdraw + claim)…');
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: VAULT_CONFIG.vault.address, abi: ARROW_VAULT_ABI, functionName: 'exit',
    args: [],
  });
  await getPublicClient().waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Admin-only: send more ARROW reward tokens into the vault, then call
 * notifyRewardAmount(reward, duration) to start a new reward period.
 * durationSeconds must be > 0, and rewardRate (reward/duration) must not
 * exceed the vault's ARROW balance / duration, per the contract's own check.
 */
export async function fundAndStartRewards({ account, amount, durationSeconds, onStatus }) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();
  const amountRaw = parseUnits(amount, 18);
  const durationRaw = BigInt(Math.round(Number(durationSeconds)));

  onStatus?.('Sending ARROW rewards to vault…');
  const transferHash = await walletClient.writeContract({
    account, chain: arcViemChain, address: VAULT_CONFIG.rewardToken.address, abi: ERC20_ABI, functionName: 'transfer',
    args: [VAULT_CONFIG.vault.address, amountRaw],
  });
  await getPublicClient().waitForTransactionReceipt({ hash: transferHash });

  onStatus?.('Starting new reward period…');
  const notifyHash = await walletClient.writeContract({
    account, chain: arcViemChain, address: VAULT_CONFIG.vault.address, abi: ARROW_VAULT_ABI, functionName: 'notifyRewardAmount',
    args: [amountRaw, durationRaw],
  });
  await getPublicClient().waitForTransactionReceipt({ hash: notifyHash });
  return notifyHash;
}