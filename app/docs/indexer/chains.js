export const CHAINS = {
  arc: {
    rpcEnv: 'ARC_RPC_URL',
    domain: 26,
    contracts: {
      pool: '0x92318C8845283B9E8A33124Ef4EC520491F826F0',
      swap: '0x847ee9aA98A05d371Be291A95A087FA02E77A416',
      vault: '0x23B595fcFD75F8fD46FC044220b74a93cdFDd7F9',
      cctp: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA', // TokenMessengerV2
    },
  },
  eth_sepolia: {
    rpcEnv: 'ETH_SEPOLIA_RPC_URL',
    domain: 0,
    contracts: {
      cctp: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    },
  },
  base_sepolia: {
    rpcEnv: 'BASE_SEPOLIA_RPC_URL',
    domain: 6,
    contracts: {
      cctp: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    },
  },
};

export const POLL_INTERVAL_MS = 15_000;
export const BLOCK_CHUNK_SIZE = 2000n; // getLogs range per call, tune to your RPC's limit