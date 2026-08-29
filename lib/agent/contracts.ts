// lib/agent/contracts.ts
// Central registry of every deployed contract the agent can act on.
//
// IMPORTANT: this file must stay client-safe. Do NOT instantiate a viem
// client here — it gets imported by "use client" files (executeAction.js),
// and creating a client at module-load time with a server-only env var
// (ARC_RPC_URL, no NEXT_PUBLIC_ prefix) throws UrlRequiredError in the
// browser the instant this module is imported. Server-side reads live in
// lib/agent/priceServer.ts instead.

export const ARC_TESTNET = {
  id: 5042002, // confirmed Arc Testnet chain id
  name: "Arc Testnet",
} as const;

export const ADDRESSES = {
  WUSDC: "0x6eE5a47Ae9F0536675041ed900fD3Ef1AA1Dea18",
  ARROW: "0xf49963fF85418060dD7F8310FEEf3Ce6E37e2561",
  ArrowPool: "0x92318C8845283B9E8A33124Ef4EC520491F826F0", // WUSDC/ARROW — also the LP token (ArrowPool is an ERC20)
  ArrowSwap: "0x847ee9aA98A05d371Be291A95A087FA02E77A416", // USDC/EURC — also the LP token
  ArrowVault: "0x23B595fcFD75F8fD46FC044220b74a93cdFDd7F9",
  ArrowRouter: "0x94D72FdDC5A6bF52968797699dAce54812934765",
  ArrowFactory: "0x04722Bc000D0257C8e7b364975b4d89c0f36a86d",
  USDC: "0x3600000000000000000000000000000000000000",
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
} as const;

// Minimal ABI fragments — only what the agent calls.
// Matches ArrowPool.sol EXACTLY:
//   - getReserves() returns (uint256, uint256) — no timestamp, no uint112 packing
//   - addLiquidity(amountADesired, amountBDesired, amountAMin, amountBMin)
//   - removeLiquidity(liquidity, amountAMin, amountBMin)
export const POOL_ABI = [
  {
    name: "getReserves",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserveA", type: "uint256" },
      { name: "reserveB", type: "uint256" },
    ],
  },
  {
    name: "addLiquidity",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountADesired", type: "uint256" },
      { name: "amountBDesired", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
    ],
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
      { name: "liquidity", type: "uint256" },
    ],
  },
  {
    name: "removeLiquidity",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "liquidity", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
    ],
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
    ],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Was missing entirely — this is the direct cause of the
// "'ERC20_ABI' is not exported from '@/lib/agent/contracts'" webpack error.
export const ERC20_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const VAULT_ABI = [
  {
    name: "stake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "exit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "earned",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const ROUTER_ABI = [
  {
    name: "swapExactTokensForTokens",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;