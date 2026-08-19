// scripts/checkEurcRate.js
//
// Reads live reserves from ArrowSwap (USDC/EURC pool) on Arc Testnet and
// prints the current implied exchange rate. Read-only — never sends a
// transaction, has no effect on the pool, bots, or anything else.
//
// Run: node scripts/checkEurcRate.js

import { createPublicClient, http, formatUnits } from "viem";
import { arcTestnet } from "viem/chains";

// --- Config ---------------------------------------------------------

const ARROW_SWAP_ADDRESS = "0x847ee9aA98A05d371Be291A95A087FA02E77A416";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const DECIMALS = 6; // both USDC and EURC use 6 decimals

const arrowSwapAbi = [
  {
    inputs: [],
    name: "getReserves",
    outputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "uint256", name: "", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "tokenA",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "tokenB",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "reserveIn", type: "uint256" },
      { internalType: "uint256", name: "reserveOut", type: "uint256" },
    ],
    name: "getAmountOut",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "pure",
    type: "function",
  },
];

// --- Client ----------------------------------------------------------

const client = createPublicClient({
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.io"),
});

async function main() {
  const [tokenA, tokenB, reserves] = await Promise.all([
    client.readContract({ address: ARROW_SWAP_ADDRESS, abi: arrowSwapAbi, functionName: "tokenA" }),
    client.readContract({ address: ARROW_SWAP_ADDRESS, abi: arrowSwapAbi, functionName: "tokenB" }),
    client.readContract({ address: ARROW_SWAP_ADDRESS, abi: arrowSwapAbi, functionName: "getReserves" }),
  ]);

  const [reserveARaw, reserveBRaw] = reserves;

  const aIsUsdc = tokenA.toLowerCase() === USDC_ADDRESS.toLowerCase();
  const usdcReserveRaw = aIsUsdc ? reserveARaw : reserveBRaw;
  const eurcReserveRaw = aIsUsdc ? reserveBRaw : reserveARaw;

  const usdcReserve = Number(formatUnits(usdcReserveRaw, DECIMALS));
  const eurcReserve = Number(formatUnits(eurcReserveRaw, DECIMALS));

  const usdcPerEurc = usdcReserve / eurcReserve; // pool midpoint rate, ignoring fee/slippage
  const eurcPerUsdc = eurcReserve / usdcReserve;

  // Also show the REAL quote for a 1 EURC swap, including the 0.30% fee,
  // using the pool's own getAmountOut (matches on-chain behavior exactly).
  const oneEurcRaw = 1n * 10n ** BigInt(DECIMALS);
  const quotedUsdcOutRaw = await client.readContract({
    address: ARROW_SWAP_ADDRESS,
    abi: arrowSwapAbi,
    functionName: "getAmountOut",
    args: [oneEurcRaw, eurcReserveRaw, usdcReserveRaw],
  });
  const quotedUsdcOut = Number(formatUnits(quotedUsdcOutRaw, DECIMALS));

  console.log("ArrowSwap (USDC/EURC) — current pool state");
  console.log("--------------------------------------------");
  console.log(`USDC reserve: ${usdcReserve.toLocaleString()}`);
  console.log(`EURC reserve: ${eurcReserve.toLocaleString()}`);
  console.log(`Midpoint rate:  1 EURC = ${usdcPerEurc.toFixed(4)} USDC`);
  console.log(`Midpoint rate:  1 USDC = ${eurcPerUsdc.toFixed(4)} EURC`);
  console.log(`Real quote:     swapping 1 EURC now returns ${quotedUsdcOut.toFixed(4)} USDC (incl. 0.30% fee)`);
  console.log("--------------------------------------------");
  console.log(`Target:         1 EURC = 1.1600 USDC`);
  console.log(`Drift:          ${(usdcPerEurc - 1.16).toFixed(4)} USDC off target`);
}

main().catch((err) => {
  console.error("Failed to check rate:", err);
  process.exit(1);
});