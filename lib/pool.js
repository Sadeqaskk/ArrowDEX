import { createPublicClient, createWalletClient, custom, http, formatUnits, parseUnits, defineChain } from 'viem';
import { CHAINS } from './chains';
import { POOL_CONFIG, ERC20_ABI, ARROW_POOL_ABI } from './poolConfig';

const arc = CHAINS.arcTestnet;

// Arc Testnet's officially deployed Multicall3 contract (same address as most
// EVM chains). Batches multiple reads into a single RPC call instead of one
// call per value — this is what was tripping the rate limit in getPoolState.
// https://docs.arc.io/arc/references/contract-addresses
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

// viem's wallet actions (writeContract, sendTransaction) need a real `chain`
// object — not just an RPC URL — to format/validate requests against. Without
// it: "No chain was provided to the request."
const arcViemChain = defineChain({
  id: arc.chainId,
  name: arc.name,
  nativeCurrency: arc.nativeCurrency,
  rpcUrls: { default: { http: [arc.rpcUrl] } },
  blockExplorers: arc.explorer ? { default: { name: `${arc.name} Explorer`, url: arc.explorer } } : undefined,
});

// Reuse a single client instead of creating a new one on every call.
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

/**
 * Real read: current pool reserves, total LP supply, and the user's LP + token
 * balances — batched into ONE RPC call via Multicall3 instead of 5 separate
 * eth_call requests. This is the fix for the RPC rate-limit errors: one
 * refresh now costs one request no matter how many values it needs.
 */
export async function getPoolState(userAddress) {
  const client = getPublicClient();
  const hasUser = !!userAddress;
  const account = hasUser ? userAddress : '0x0000000000000000000000000000000000000000';

  const results = await client.multicall({
    multicallAddress: MULTICALL3_ADDRESS,
    contracts: [
      { address: POOL_CONFIG.pool.address, abi: ARROW_POOL_ABI, functionName: 'getReserves' },
      { address: POOL_CONFIG.pool.address, abi: ARROW_POOL_ABI, functionName: 'totalSupply' },
      { address: POOL_CONFIG.pool.address, abi: ARROW_POOL_ABI, functionName: 'balanceOf', args: [account] },
      { address: POOL_CONFIG.wusdc.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] },
      { address: POOL_CONFIG.arrow.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] },
    ],
  });

  const [reservesR, totalSupplyR, lpBalanceR, wusdcBalanceR, arrowBalanceR] = results;

  if (reservesR.status !== 'success') {
    throw new Error(reservesR.error?.message || 'Failed to read pool reserves.');
  }
  const reserves = reservesR.result;
  const totalSupply = totalSupplyR.status === 'success' ? totalSupplyR.result : 0n;
  const lpBalance = hasUser && lpBalanceR.status === 'success' ? lpBalanceR.result : 0n;
  const wusdcBalance = hasUser && wusdcBalanceR.status === 'success' ? wusdcBalanceR.result : 0n;
  const arrowBalance = hasUser && arrowBalanceR.status === 'success' ? arrowBalanceR.result : 0n;

  return {
    reserveWusdc: formatUnits(reserves[0], 18),
    reserveArrow: formatUnits(reserves[1], 18),
    reserveWusdcRaw: reserves[0],
    reserveArrowRaw: reserves[1],
    totalSupply: formatUnits(totalSupply, 18),
    totalSupplyRaw: totalSupply,
    lpBalance: formatUnits(lpBalance, 18),
    lpBalanceRaw: lpBalance,
    wusdcBalance: formatUnits(wusdcBalance, 18),
    arrowBalance: formatUnits(arrowBalance, 18),
  };
}

/** Quote how much ARROW you'd get for a given WUSDC input (or vice versa), using the contract's own pure function. */
export async function quoteSwap(amountIn, reserveIn, reserveOut) {
  const client = getPublicClient();
  const amountOut = await client.readContract({
    address: POOL_CONFIG.pool.address,
    abi: ARROW_POOL_ABI,
    functionName: 'getAmountOut',
    args: [amountIn, reserveIn, reserveOut],
  });
  return amountOut;
}

/**
 * Real write: wrap native USDC into WUSDC by calling the WUSDC contract's
 * deposit() with native USDC attached as value (1:1, per WrappedUSDC.sol).
 * amountDecimalString is a decimal string like "5" or "12.5".
 */
export async function wrapUsdc({ account, amount, onStatus }) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();
  const value = parseUnits(amount, 18); // native USDC uses 18 decimals on Arc

  onStatus?.('Wrapping USDC…');
  const hash = await walletClient.writeContract({
    account,
    chain: arcViemChain,
    address: POOL_CONFIG.wusdc.address,
    abi: ERC20_ABI,
    functionName: 'deposit',
    value,
  });

  const publicClient = getPublicClient();
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Real write: unwrap WUSDC back into native USDC by calling the WUSDC
 * contract's withdraw(amount). Burns WUSDC 1:1 and sends native USDC back —
 * no approval needed since you're withdrawing your own balance.
 */
export async function unwrapUsdc({ account, amount, onStatus }) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();
  const value = parseUnits(amount, 18); // WUSDC is 18 decimals

  onStatus?.('Unwrapping WUSDC…');
  const hash = await walletClient.writeContract({
    account,
    chain: arcViemChain,
    address: POOL_CONFIG.wusdc.address,
    abi: ERC20_ABI,
    functionName: 'withdraw',
    args: [value],
  });

  const publicClient = getPublicClient();
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
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

async function approveIfNeeded(tokenAddress, account, amount) {
  const publicClient = getPublicClient();
  const currentAllowance = await publicClient.readContract({
    address: tokenAddress, abi: ERC20_ABI, functionName: 'allowance',
    args: [account, POOL_CONFIG.pool.address],
  });

  if (currentAllowance >= amount) return null; // already approved enough

  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: tokenAddress, abi: ERC20_ABI, functionName: 'approve',
    args: [POOL_CONFIG.pool.address, amount],
  });
  const publicClientForWait = getPublicClient();
  await publicClientForWait.waitForTransactionReceipt({ hash });
  return hash;
}

/** Real addLiquidity call — approves both tokens first if needed, then deposits. */
export async function addLiquidity({ account, amountWusdc, amountArrow, slippagePct = 1, onStatus }) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();

  const amountA = parseUnits(amountWusdc, 18);
  const amountB = parseUnits(amountArrow, 18);
  const amountAMin = (amountA * BigInt(Math.round((100 - slippagePct) * 100))) / 10000n;
  const amountBMin = (amountB * BigInt(Math.round((100 - slippagePct) * 100))) / 10000n;

  onStatus?.('Checking WUSDC approval…');
  await approveIfNeeded(POOL_CONFIG.wusdc.address, account, amountA);

  onStatus?.('Checking ARROW approval…');
  await approveIfNeeded(POOL_CONFIG.arrow.address, account, amountB);

  onStatus?.('Adding liquidity…');
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: POOL_CONFIG.pool.address, abi: ARROW_POOL_ABI, functionName: 'addLiquidity',
    args: [amountA, amountB, amountAMin, amountBMin],
  });

  const publicClient = getPublicClient();
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Real removeLiquidity call. */
export async function removeLiquidity({ account, lpAmount, slippagePct = 1, onStatus }) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();
  const liquidity = parseUnits(lpAmount, 18);

  onStatus?.('Removing liquidity…');
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: POOL_CONFIG.pool.address, abi: ARROW_POOL_ABI, functionName: 'removeLiquidity',
    args: [liquidity, 0n, 0n], // min amounts left at 0 for simplicity; UI should confirm expected output before calling
  });

  const publicClient = getPublicClient();
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Real swap through the pool (WUSDC -> ARROW or ARROW -> WUSDC). */
export async function swapThroughPool({ account, direction, amountIn, minAmountOut, onStatus }) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();

  const tokenIn = direction === 'wusdcToArrow' ? POOL_CONFIG.wusdc.address : POOL_CONFIG.arrow.address;
  const functionName = direction === 'wusdcToArrow' ? 'swapAForB' : 'swapBForA';

  onStatus?.('Checking approval…');
  await approveIfNeeded(tokenIn, account, amountIn);

  onStatus?.('Swapping…');
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: POOL_CONFIG.pool.address, abi: ARROW_POOL_ABI, functionName,
    args: [amountIn, minAmountOut],
  });

  const publicClient = getPublicClient();
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}