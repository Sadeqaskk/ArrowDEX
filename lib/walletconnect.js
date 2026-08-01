'use client';

// Lazy-loaded so @walletconnect/ethereum-provider (browser-only) never
// touches server-side rendering.
let providerInstance = null;

export async function getWalletConnectProvider() {
  if (providerInstance) return providerInstance;

  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      'Missing WalletConnect project ID. Get a free one at https://cloud.walletconnect.com and add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to your .env.local file.'
    );
  }

  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');

  providerInstance = await EthereumProvider.init({
    projectId,
    metadata: {
      name: 'Arrow DEX',
      description: 'Cross-chain DeFi exchange on Arc Testnet',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://arrow-dex.example',
      icons: [],
    },
    showQrModal: true,
    optionalChains: [5042002, 11155111, 84532], // Arc Testnet, Ethereum Sepolia, Base Sepolia
    rpcMap: {
      5042002: 'https://rpc.testnet.arc.network',
      11155111: 'https://rpc.sepolia.org',
      84532: 'https://sepolia.base.org',
    },
  });

  return providerInstance;
}

export function resetWalletConnectProvider() {
  providerInstance = null;
}