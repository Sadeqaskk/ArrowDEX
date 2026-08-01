import { createPublicClient, createWalletClient, custom, http, formatUnits, defineChain } from 'viem';
import { CHAINS } from './chains';
import { FAUCET_ADDRESS, ARROW_FAUCET_ABI } from './faucetConfig';

const arc = CHAINS.arcTestnet;

// Arc Testnet's officially deployed Multicall3 contract.
// https://docs.arc.io/arc/references/contract-addresses
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
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No injected wallet found.');
  }
  return createWalletClient({ chain: arcViemChain, transport: custom(window.ethereum) });
}

async function ensureArcNetwork() {
  if (!window.ethereum) throw new Error('No injected wallet found.');
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: arc.chainIdHex }] });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
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

/** True once FAUCET_ADDRESS has actually been set to a deployed contract. */
export function isFaucetConfigured() {
  return !!FAUCET_ADDRESS;
}

/**
 * Reads everything the faucet UI needs in one batched Multicall3 call:
 * how much a claim gives you, the faucet's remaining balance, and how long
 * until this wallet can claim again.
 */
export async function getFaucetState(userAddress) {
  if (!FAUCET_ADDRESS) return null;

  const client = getPublicClient();
  const account = userAddress || '0x0000000000000000000000000000000000000000';

  const results = await client.multicall({
    multicallAddress: MULTICALL3_ADDRESS,
    contracts: [
      { address: FAUCET_ADDRESS, abi: ARROW_FAUCET_ABI, functionName: 'claimAmount' },
      { address: FAUCET_ADDRESS, abi: ARROW_FAUCET_ABI, functionName: 'faucetBalance' },
      { address: FAUCET_ADDRESS, abi: ARROW_FAUCET_ABI, functionName: 'timeUntilNextClaim', args: [account] },
    ],
  });

  const [claimAmountR, faucetBalanceR, timeUntilNextClaimR] = results;

  const claimAmount = claimAmountR.status === 'success' ? claimAmountR.result : 0n;
  const faucetBalance = faucetBalanceR.status === 'success' ? faucetBalanceR.result : 0n;
  const secondsUntilNextClaim = timeUntilNextClaimR.status === 'success' ? Number(timeUntilNextClaimR.result) : 0;

  return {
    claimAmount: formatUnits(claimAmount, 18),
    faucetBalance: formatUnits(faucetBalance, 18),
    secondsUntilNextClaim,
    canClaim: secondsUntilNextClaim === 0 && faucetBalance >= claimAmount,
    isEmpty: faucetBalance < claimAmount,
  };
}

/** Claim ARROW from the faucet. */
export async function claimArrow({ account, onStatus }) {
  if (!FAUCET_ADDRESS) throw new Error('Faucet not configured yet.');

  await ensureArcNetwork();
  const walletClient = getWalletClient();

  onStatus?.('Claiming ARROW…');
  const hash = await walletClient.writeContract({
    account,
    chain: arcViemChain,
    address: FAUCET_ADDRESS,
    abi: ARROW_FAUCET_ABI,
    functionName: 'claim',
  });

  const publicClient = getPublicClient();
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}