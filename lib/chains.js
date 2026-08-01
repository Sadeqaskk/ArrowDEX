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
    cctpDomain: 26,
    tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
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
  },
};

// NOTE: the rpcUrl values above are public endpoints, fine for development.
// For production, swap these for a dedicated provider (Alchemy/Infura/QuickNode)
// to avoid public-RPC rate limits — public endpoints can silently throttle or
// drop requests under load.

export const CHAIN_LIST = Object.values(CHAINS);

export function getChainByChainId(chainId) {
  return CHAIN_LIST.find((c) => c.chainId === Number(chainId)) || null;
}

// Circle's testnet attestation API (Iris) — sandbox endpoint, matches Circle's own quickstart docs.
export const IRIS_API_BASE = 'https://iris-api-sandbox.circle.com/v2';