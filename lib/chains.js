/**
 * Chain and CCTP configuration.
 *
 * All addresses below are sourced directly from Circle's official docs:
 * - CCTP contract addresses: https://developers.circle.com/cctp/references/contract-addresses
 * - Arc Testnet connection details: https://docs.arc.io/arc/references/connect-to-arc
 * - USDC testnet addresses: https://developers.circle.com/cctp/quickstarts/transfer-usdc-ethereum-to-arc
 *
 * Do not swap these for guessed addresses — CCTP burns real (test) funds if the
 * TokenMessenger / MessageTransmitter addresses are wrong for a given chain.
 */

export const CHAINS = {
  arcTestnet: {
    key: 'arcTestnet',
    chainId: 5042002,
    chainIdHex: '0x4CEF52', // 5042002 in hex
    name: 'Arc Testnet',
    rpcUrl: 'https://rpc.testnet.arc.network',
    explorer: 'https://testnet.arcscan.app',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    // Arc's USDC is native gas (18 decimals for the native balance), but Arc
    // also exposes an official ERC-20 interface over that same balance for
    // approve/transferFrom/depositForBurn — this address, confirmed from
    // Arc's docs (https://docs.arc.io/arc/references/contract-addresses).
    // The ERC-20 interface itself uses 6 decimals, matching USDC elsewhere.
    usdc: '0x3600000000000000000000000000000000000000',
    nativeIsUsdc: true,
    cctpDomain: 26,
    tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    requiresCredentials: false,
  },
  ethereumSepolia: {
    key: 'ethereumSepolia',
    chainId: 11155111,
    chainIdHex: '0xAA36A7',
    name: 'Ethereum Sepolia',
    // rpc.sepolia.org is a shared public endpoint with no SLA and frequently
    // drops/throttles requests ("Failed to fetch"). publicnode's endpoint has
    // been more reliable in practice. Same chain, same data — just a
    // different RPC provider to talk to it through.
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    cctpDomain: 0,
    tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    requiresCredentials: false,
  },
  baseSepolia: {
    key: 'baseSepolia',
    chainId: 84532,
    chainIdHex: '0x14A34',
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    cctpDomain: 6,
    tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    requiresCredentials: false,
  },
};

/**
 * Mainnet chains.
 *
 * Ethereum and Base entries below are fully verified and live:
 * - Chain IDs, RPC URLs: public, standard values.
 * - USDC addresses: confirmed directly against Etherscan/Basescan token pages.
 * - CCTP TokenMessengerV2 / MessageTransmitterV2 addresses: confirmed from
 *   Circle's mainnet contract-addresses page (same address across all EVM
 *   mainnet domains, incl. Arc's domain 26 — Circle states these are
 *   deterministic per chain).
 *
 * Arc Mainnet's chainId/rpcUrl below were supplied directly by the project
 * owner (from their own Circle private-mainnet access), not independently
 * verified against Circle's public docs or a live eth_chainId call — that
 * domain isn't reachable from this environment. Before trusting this in
 * production:
 *   1. Confirm the wallet actually lands on Arc after switching (check the
 *      wallet's own network display, not just that the switch call didn't
 *      throw).
 *   2. Confirm a read call (e.g. eth_chainId via this rpcUrl) returns 0x13B2
 *      (5042) and not an auth error. If balance fetches start failing with
 *      401/403-style errors, that means this RPC still needs an API
 *      key/credential appended to the URL or sent as a header — flip
 *      requiresCredentials back to true until that's sorted, rather than
 *      leaving it silently failing.
 */
export const MAINNET_CHAINS = {
  arcMainnet: {
    key: 'arcMainnet',
    chainId: 5042,
    chainIdHex: '0x13B2', // 5042 in hex
    name: 'Arc Mainnet',
    rpcUrl: 'https://rpc.mainnet.arc.io',
    explorer: 'https://arcscan.app',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    // Same reserved-address pattern as Arc Testnet — not independently
    // reconfirmed for mainnet, carried over on the assumption it's a fixed
    // reserved address rather than a per-deployment contract. Verify against
    // an actual mainnet balanceOf call/explorer before relying on it heavily.
    usdc: '0x3600000000000000000000000000000000000000',
    nativeIsUsdc: true,
    cctpDomain: 26,
    tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
    requiresCredentials: false,
  },
  ethereumMainnet: {
    key: 'ethereumMainnet',
    chainId: 1,
    chainIdHex: '0x1',
    name: 'Ethereum',
    // Public endpoint — fine for read-only balance checks; swap for a
    // dedicated provider (Alchemy/Infura/QuickNode) for anything higher
    // volume, same as the note below for the rest of these RPCs.
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    cctpDomain: 0,
    tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
    requiresCredentials: false,
  },
  baseMainnet: {
    key: 'baseMainnet',
    chainId: 8453,
    chainIdHex: '0x2105',
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    cctpDomain: 6,
    tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
    requiresCredentials: false,
  },
};

// NOTE: the rpcUrl values above are public endpoints, fine for development.
// For production, swap these for a dedicated provider (Alchemy/Infura/QuickNode)
// to avoid public-RPC rate limits — public endpoints can silently throttle or
// drop requests under load. This applies to both testnet and mainnet lists.

export const CHAIN_LIST = Object.values(CHAINS);
export const MAINNET_CHAIN_LIST = Object.values(MAINNET_CHAINS);

/**
 * Returns the chain list for a given network mode ('testnet' | 'mainnet').
 * This is what useBalances.js and the dashboard read to build per-chain
 * balance rows, so it must return every selectable chain for that mode —
 * gated chains (requiresCredentials: true) included, so the UI can show
 * them with a "Requires access" state instead of silently omitting them.
 */
export function getChainList(networkMode = 'testnet') {
  return networkMode === 'mainnet' ? MAINNET_CHAIN_LIST : CHAIN_LIST;
}

export function getChainByChainId(chainId) {
  const all = [...CHAIN_LIST, ...MAINNET_CHAIN_LIST];
  return all.find((c) => c.chainId === Number(chainId)) || null;
}

// Circle's testnet attestation API (Iris) — sandbox endpoint, matches Circle's own quickstart docs.
export const IRIS_API_BASE = 'https://iris-api-sandbox.circle.com/v2';

// Circle's production attestation API — used for mainnet CCTP transfers.
// NOTE: not yet wired up to networkMode anywhere; if/when the bridge page
// reads this for mainnet transfers, branch on networkMode the same way
// getChainList does, rather than swapping this constant in place.
export const IRIS_API_BASE_MAINNET = 'https://iris-api.circle.com/v2';