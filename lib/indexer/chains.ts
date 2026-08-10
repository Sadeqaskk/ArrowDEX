export const CHAINS = {
  arc: {
    rpcEnv: 'ARC_RPC_URL',
    domain: 26,
    contracts: {
      pool: '0x92318C8845283B9E8A33124Ef4EC520491F826F0',
      swap: '0x847ee9aA98A05d371Be291A95A087FA02E77A416',
      vault: '0x23B595fcFD75F8fD46FC044220b74a93cdFDd7F9',
      cctp: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    },
  },
  eth_sepolia: {
    rpcEnv: 'ETH_SEPOLIA_RPC_URL',
    domain: 0,
    contracts: { cctp: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' },
  },
  base_sepolia: {
    rpcEnv: 'BASE_SEPOLIA_RPC_URL',
    domain: 6,
    contracts: { cctp: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' },
  },
} as const;

// Keep this small — a Vercel serverless function has a time limit (see route.ts maxDuration).
// Smaller chunks mean less work (and less RPC load) per cron tick, so a run finishes
// well within the time budget even when there's a backlog to catch up on.
export const BLOCK_CHUNK_SIZE = 100n;