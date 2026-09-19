import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  pad,
  parseAbi,
} from 'viem';
import { CHAINS, MAINNET_CHAINS, IRIS_API_BASE, IRIS_API_BASE_MAINNET } from './chains';

/**
 * CCTP V2 bridge helper.
 *
 * Exports:
 *   - getPublicClient(chain)  -> cached viem public client (used by lib/activity.js)
 *   - ensureChain(chain)      -> switch (or add) the wallet's active network
 *   - runBridge({...})        -> approve -> burn -> attestation -> mint (used by app/bridge/page.js)
 *   - ERC20_ABI               -> minimal ERC-20 ABI
 *
 * `chain` arguments are entries from lib/chains.js (CHAINS / MAINNET_CHAINS).
 * Amounts are USDC subunits (6 decimals) as bigint.
 */

export const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);

// CCTP V2: 7-arg depositForBurn (matches the DepositForBurn event in lib/activity.js).
const TOKEN_MESSENGER_ABI = parseAbi([
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)',
]);

const MESSAGE_TRANSMITTER_ABI = parseAbi([
  'function receiveMessage(bytes message, bytes attestation) returns (bool success)',
]);

const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;
const FAST_FINALITY = 1000;
const STANDARD_FINALITY = 2000;
const POLL_INTERVAL_MS = 3000;
const ATTESTATION_TIMEOUT_MS = 30 * 60 * 1000; // standard transfers can take ~15-20 min on testnet

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Clients ──────────────────────────────────────────────────────────────

function toViemChain(chain) {
  return defineChain({
    id: chain.chainId,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: { default: { http: [chain.rpcUrl] } },
    blockExplorers: { default: { name: 'Explorer', url: chain.explorer } },
  });
}

const publicClients = new Map();

export function getPublicClient(chain) {
  let client = publicClients.get(chain.key);
  if (!client) {
    client = createPublicClient({
      chain: toViemChain(chain),
      transport: http(chain.rpcUrl),
    });
    publicClients.set(chain.key, client);
  }
  return client;
}

function getProvider() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet found. Connect a browser wallet and try again.');
  }
  return window.ethereum;
}

// Accepts a chain object, a chain key ('baseSepolia'), or a chain id (number or hex).
function resolveChain(target) {
  if (target && typeof target === 'object' && target.chainId) return target;
  const all = [...Object.values(CHAINS), ...Object.values(MAINNET_CHAINS)];
  const found = all.find((c) => c.key === target || c.chainId === Number(target));
  if (!found) throw new Error(`Unknown network: ${String(target)}`);
  return found;
}

export async function ensureChain(target) {
  const chain = resolveChain(target);
  const provider = getProvider();
  const hexId = `0x${chain.chainId.toString(16)}`;

  const readChainId = async () => parseInt(await provider.request({ method: 'eth_chainId' }), 16);

  if ((await readChainId()) === chain.chainId) return chain;

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
  } catch (err) {
    if (err?.code === 4001) {
      throw new Error(`Switching to ${chain.name} was rejected in your wallet.`);
    }
    // 4902 = chain not added yet (some wallets report it as -32603).
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: hexId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [chain.rpcUrl],
          blockExplorerUrls: [chain.explorer],
        },
      ],
    });
  }

  if ((await readChainId()) !== chain.chainId) {
    throw new Error(`Your wallet is not on ${chain.name}. Switch networks in your wallet and try again.`);
  }
  return chain;
}

function getWalletClient(chain, account) {
  return createWalletClient({
    account,
    chain: toViemChain(chain),
    transport: custom(getProvider()),
  });
}

async function confirm(chain, hash) {
  const receipt = await getPublicClient(chain).waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error(`Transaction reverted on ${chain.name} (${hash}).`);
  }
  return receipt;
}

// ── Circle Iris (fees + attestation) ─────────────────────────────────────

// Decide fast vs standard transfer and the maxFee cap for this route.
async function getFeeParams(irisBase, sourceDomain, destDomain, amount) {
  // Fallback if the fee endpoint is unreachable: ask for fast finality with a
  // 0.1% cap (min 0.0005 USDC). If the cap is too low, Circle simply attests at
  // standard finality instead, so this can only make the transfer slower.
  let fallbackFee = amount / 1000n;
  if (fallbackFee < 500n) fallbackFee = 500n;
  if (fallbackFee >= amount) fallbackFee = amount > 1n ? amount - 1n : 0n;
  const fallback = { maxFee: fallbackFee, minFinalityThreshold: FAST_FINALITY, mode: 'fast' };

  try {
    const res = await fetch(`${irisBase}/burn/USDC/fees/${sourceDomain}/${destDomain}`);
    if (!res.ok) return fallback;
    const tiers = await res.json();
    if (!Array.isArray(tiers)) return fallback;

    const fast = tiers.find((t) => Number(t.finalityThreshold) === FAST_FINALITY);
    if (!fast) {
      return { maxFee: 0n, minFinalityThreshold: STANDARD_FINALITY, mode: 'standard' };
    }

    // minimumFee is in basis points (can be fractional). Work in bps * 1000.
    const bpsScaled = BigInt(Math.ceil(Number(fast.minimumFee) * 1000));
    let fee = (amount * bpsScaled + 9_999_999n) / 10_000_000n; // ceil(amount * bps / 10000)
    fee = fee * 2n + 1n; // headroom in case the schedule moves before attestation
    if (fee >= amount) fee = amount > 1n ? amount - 1n : 0n;
    return { maxFee: fee, minFinalityThreshold: FAST_FINALITY, mode: 'fast' };
  } catch {
    return fallback;
  }
}

async function waitForAttestation(irisBase, sourceDomain, burnHash) {
  const url = `${irisBase}/messages/${sourceDomain}?transactionHash=${burnHash}`;
  const deadline = Date.now() + ATTESTATION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const msg = data?.messages?.[0];
        if (msg && msg.status === 'complete' && msg.attestation && msg.attestation !== 'PENDING') {
          return { message: msg.message, attestation: msg.attestation };
        }
      }
      // 404 just means Circle hasn't indexed the burn yet — keep polling.
    } catch {
      // Network blip — keep polling.
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error('Timed out waiting for Circle attestation.');
}

// ── Bridge ───────────────────────────────────────────────────────────────

function errorText(err) {
  return err?.shortMessage || err?.message || 'Unknown error';
}

/**
 * @param {object}   params
 * @param {object}   params.sourceChain       entry from lib/chains.js
 * @param {object}   params.destinationChain  entry from lib/chains.js
 * @param {string}   params.account           connected wallet address
 * @param {bigint}   params.amount            USDC subunits (6 decimals)
 * @param {string}   [params.networkMode]     'testnet' | 'mainnet' — picks the Iris endpoint
 * @param {function} [params.onStatus]        ({ step, status, hash?, message? }) => void
 * @returns {Promise<{ burnHash: string, mintHash: string }>}
 */
export async function runBridge({
  sourceChain,
  destinationChain,
  account,
  amount,
  networkMode = 'testnet',
  onStatus = () => {},
}) {
  if (!sourceChain || !destinationChain) throw new Error('Missing source or destination chain.');
  if (!account) throw new Error('Wallet not connected.');
  if (typeof amount !== 'bigint' || amount <= 0n) throw new Error('Enter an amount greater than 0.');
  if (sourceChain.requiresCredentials || destinationChain.requiresCredentials) {
    throw new Error('One of the selected chains is not available yet.');
  }

  const irisBase = networkMode === 'mainnet' ? IRIS_API_BASE_MAINNET : IRIS_API_BASE;
  const sourcePublic = getPublicClient(sourceChain);
  let burnHash = null;

  try {
    // Balance check up front so a short balance fails before any wallet prompt.
    const balance = await sourcePublic.readContract({
      address: sourceChain.usdc,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account],
    });
    if (balance < amount) {
      throw new Error(`Not enough USDC on ${sourceChain.name} for this amount.`);
    }

    // 1) Approve ─────────────────────────────────────────────────────────
    onStatus({ step: 'approve', status: 'pending', message: `Approve USDC on ${sourceChain.name} in your wallet…` });
    await ensureChain(sourceChain);
    const sourceWallet = getWalletClient(sourceChain, account);

    const allowance = await sourcePublic.readContract({
      address: sourceChain.usdc,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account, sourceChain.tokenMessenger],
    });

    if (allowance >= amount) {
      onStatus({ step: 'approve', status: 'done', message: 'USDC already approved.' });
    } else {
      const approveHash = await sourceWallet.writeContract({
        address: sourceChain.usdc,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [sourceChain.tokenMessenger, amount],
        account,
      });
      onStatus({ step: 'approve', status: 'pending', hash: approveHash, message: 'Waiting for approval to confirm…' });
      await confirm(sourceChain, approveHash);
      onStatus({ step: 'approve', status: 'done', hash: approveHash });
    }

    // 2) Burn ────────────────────────────────────────────────────────────
    onStatus({ step: 'burn', status: 'pending', message: `Confirm the burn on ${sourceChain.name} in your wallet…` });
    const fees = await getFeeParams(irisBase, sourceChain.cctpDomain, destinationChain.cctpDomain, amount);

    burnHash = await sourceWallet.writeContract({
      address: sourceChain.tokenMessenger,
      abi: TOKEN_MESSENGER_ABI,
      functionName: 'depositForBurn',
      args: [
        amount,
        destinationChain.cctpDomain,
        pad(account, { size: 32 }), // mint to the same address on the destination chain
        sourceChain.usdc,
        ZERO_BYTES32, // any relayer/wallet may submit the mint
        fees.maxFee,
        fees.minFinalityThreshold,
      ],
      account,
    });
    onStatus({ step: 'burn', status: 'pending', hash: burnHash, message: 'Waiting for burn to confirm…' });
    await confirm(sourceChain, burnHash);
    onStatus({ step: 'burn', status: 'done', hash: burnHash });

    // 3) Attestation ─────────────────────────────────────────────────────
    onStatus({
      step: 'attestation',
      status: 'pending',
      message:
        fees.mode === 'fast'
          ? 'Waiting for Circle attestation (fast transfer, usually under a minute)…'
          : 'Waiting for Circle attestation (standard transfer, this can take 15+ minutes)…',
    });
    const { message, attestation } = await waitForAttestation(irisBase, sourceChain.cctpDomain, burnHash);
    onStatus({ step: 'attestation', status: 'done' });

    // 4) Mint ────────────────────────────────────────────────────────────
    onStatus({ step: 'mint', status: 'pending', message: `Confirm the mint on ${destinationChain.name} in your wallet…` });
    await ensureChain(destinationChain);
    const destWallet = getWalletClient(destinationChain, account);

    const mintHash = await destWallet.writeContract({
      address: destinationChain.messageTransmitter,
      abi: MESSAGE_TRANSMITTER_ABI,
      functionName: 'receiveMessage',
      args: [message, attestation],
      account,
    });
    onStatus({ step: 'mint', status: 'pending', hash: mintHash, message: 'Waiting for mint to confirm…' });
    await confirm(destinationChain, mintHash);
    onStatus({ step: 'mint', status: 'done', hash: mintHash });

    return { burnHash, mintHash };
  } catch (err) {
    const base = errorText(err);
    if (burnHash) {
      // The burn already happened, so make it clear the funds are not lost.
      throw new Error(
        `${base} — your USDC was already burned on ${sourceChain.name} (burn tx ${burnHash}). ` +
          `It can still be minted on ${destinationChain.name} once the attestation is available.`,
        { cause: err }
      );
    }
    throw new Error(base, { cause: err });
  }
}