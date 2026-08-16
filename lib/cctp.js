import { createPublicClient, createWalletClient, custom, http, encodeFunctionData, pad, defineChain } from 'viem';
import { CHAINS, IRIS_API_BASE } from './chains';
import { getActiveProvider } from './activeProvider';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

const TOKEN_MESSENGER_ABI = [
  {
    type: 'function',
    name: 'depositForBurn',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
    ],
    outputs: [],
  },
];

const MESSAGE_TRANSMITTER_ABI = [
  {
    type: 'function',
    name: 'receiveMessage',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'message', type: 'bytes' },
      { name: 'attestation', type: 'bytes' },
    ],
    outputs: [],
  },
];

const EMPTY_BYTES32 = `0x${'0'.repeat(64)}`;

const viemChainCache = new Map();

function toViemChain(chainConfig) {
  if (viemChainCache.has(chainConfig.key)) return viemChainCache.get(chainConfig.key);

  const viemChain = defineChain({
    id: chainConfig.chainId,
    name: chainConfig.name,
    nativeCurrency: chainConfig.nativeCurrency,
    rpcUrls: {
      default: { http: [chainConfig.rpcUrl] },
    },
    blockExplorers: chainConfig.explorer
      ? { default: { name: `${chainConfig.name} Explorer`, url: chainConfig.explorer } }
      : undefined,
  });

  viemChainCache.set(chainConfig.key, viemChain);
  return viemChain;
}

/** Build a viem wallet client bound to whichever wallet is actually connected (MetaMask, Rabby, WalletConnect, etc.), targeting a specific chain. */
function getWalletClient(chainConfig) {
  const provider = getActiveProvider();
  if (!provider) {
    throw new Error('No wallet connected.');
  }
  return createWalletClient({
    chain: toViemChain(chainConfig),
    transport: custom(provider),
  });
}

export function getPublicClient(chainConfig) {
  return createPublicClient({
    chain: toViemChain(chainConfig),
    transport: http(chainConfig.rpcUrl),
  });
}

export async function getNativeBalance(chainConfig, address) {
  const publicClient = getPublicClient(chainConfig);
  return publicClient.getBalance({ address });
}

export async function ensureChain(chainConfig) {
  const provider = getActiveProvider();
  if (!provider) throw new Error('No wallet connected.');
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainConfig.chainIdHex }],
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainConfig.chainIdHex,
            chainName: chainConfig.name,
            nativeCurrency: chainConfig.nativeCurrency,
            rpcUrls: [chainConfig.rpcUrl],
            blockExplorerUrls: [chainConfig.explorer],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

export async function getUsdcBalance(chainConfig, address) {
  if (!chainConfig.usdc) throw new Error(`${chainConfig.name} has no separate USDC token contract.`);
  const publicClient = getPublicClient(chainConfig);
  const balance = await publicClient.readContract({
    address: chainConfig.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
  return balance;
}

export async function approveUsdc(chainConfig, account, amount) {
  await ensureChain(chainConfig);
  const walletClient = getWalletClient(chainConfig);
  const hash = await walletClient.sendTransaction({
    account,
    chain: toViemChain(chainConfig),
    to: chainConfig.usdc,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [chainConfig.tokenMessenger, amount],
    }),
  });
  return hash;
}

export async function burnUsdc(sourceChain, destinationChain, account, amount, minFinalityThreshold = 1000) {
  await ensureChain(sourceChain);
  const walletClient = getWalletClient(sourceChain);

  const mintRecipientBytes32 = pad(account, { size: 32 });
  const maxFee = amount / 2000n > 0n ? amount / 2000n : 1n;

  const hash = await walletClient.sendTransaction({
    account,
    chain: toViemChain(sourceChain),
    to: sourceChain.tokenMessenger,
    data: encodeFunctionData({
      abi: TOKEN_MESSENGER_ABI,
      functionName: 'depositForBurn',
      args: [
        amount,
        destinationChain.cctpDomain,
        mintRecipientBytes32,
        sourceChain.usdc,
        EMPTY_BYTES32,
        maxFee,
        minFinalityThreshold,
      ],
    }),
  });
  return hash;
}

export async function pollAttestation(sourceDomain, transactionHash, { intervalMs = 5000, onStatus } = {}) {
  const url = `${IRIS_API_BASE}/messages/${sourceDomain}?transactionHash=${transactionHash}`;

  while (true) {
    try {
      const response = await fetch(url, { method: 'GET' });

      if (!response.ok) {
        if (response.status !== 404) {
          onStatus?.(`Attestation API returned ${response.status}, retrying…`);
        }
        await sleep(intervalMs);
        continue;
      }

      const data = await response.json();
      const message = data?.messages?.[0];

      if (message?.status === 'complete') {
        onStatus?.('Attestation retrieved.');
        return message;
      }

      onStatus?.('Waiting for attestation…');
      await sleep(intervalMs);
    } catch (err) {
      onStatus?.(`Error polling attestation: ${err.message}`);
      await sleep(intervalMs);
    }
  }
}

export async function mintUsdc(destinationChain, account, attestationMessage) {
  await ensureChain(destinationChain);
  const walletClient = getWalletClient(destinationChain);

  const hash = await walletClient.sendTransaction({
    account,
    chain: toViemChain(destinationChain),
    to: destinationChain.messageTransmitter,
    data: encodeFunctionData({
      abi: MESSAGE_TRANSMITTER_ABI,
      functionName: 'receiveMessage',
      args: [attestationMessage.message, attestationMessage.attestation],
    }),
  });
  return hash;
}

export async function runBridge({ sourceChain, destinationChain, account, amount, onStatus }) {
  onStatus?.({ step: 'approve', status: 'pending' });
  const approveTx = await approveUsdc(sourceChain, account, amount);
  onStatus?.({ step: 'approve', status: 'done', hash: approveTx });

  onStatus?.({ step: 'burn', status: 'pending' });
  const burnTx = await burnUsdc(sourceChain, destinationChain, account, amount);
  onStatus?.({ step: 'burn', status: 'done', hash: burnTx });

  onStatus?.({ step: 'attestation', status: 'pending' });
  const attestation = await pollAttestation(sourceChain.cctpDomain, burnTx, {
    onStatus: (msg) => onStatus?.({ step: 'attestation', status: 'pending', message: msg }),
  });
  onStatus?.({ step: 'attestation', status: 'done' });

  onStatus?.({ step: 'mint', status: 'pending' });
  const mintTx = await mintUsdc(destinationChain, account, attestation);
  onStatus?.({ step: 'mint', status: 'done', hash: mintTx });

  return { approveTx, burnTx, mintTx };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}