import { createPublicClient, createWalletClient, custom, http, formatUnits, parseUnits, defineChain } from 'viem';
import { CHAINS } from './chains';
import { POOL_VIEW_ABI, ARROWSWAP_ABI, ARROWPOOL_ABI, ERC20_ABI, getTokenBySymbol } from './swapConfig';
import { getActiveProvider } from './activeProvider';

const arc = CHAINS.arcTestnet;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

const arcViemChain = defineChain({
  id: arc.chainId,
  name: arc.name,
  nativeCurrency: arc.nativeCurrency,
  rpcUrls: { default: { http: [arc.rpcUrl] } },
  blockExplorers: arc.explorer ? { default: { name: `${arc.name} Explorer`, url: arc.explorer } } : undefined,
});

let _publicClient = null;
function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain: arcViemChain, transport: http(arc.rpcUrl) });
  }
  return _publicClient;
}

function getWalletClient() {
  const provider = getActiveProvider();
  if (!provider) {
    throw new Error('No wallet connected.');
  }
  return createWalletClient({ chain: arcViemChain, transport: custom(provider) });
}

async function ensureArcNetwork() {
  const provider = getActiveProvider();
  if (!provider) throw new Error('No wallet connected.');
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: arc.chainIdHex }] });
  } catch (err) {
    if (err.code === 4902) {
      await provider.request({
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

export async function getPoolState(pool, userAddress) {
  const client = getPublicClient();
  const hasUser = !!userAddress;
  const account = hasUser ? userAddress : ZERO_ADDRESS;

  const tokenAInfo = getTokenBySymbol(pool.tokenA);
  const tokenBInfo = getTokenBySymbol(pool.tokenB);

  const results = await client.multicall({
    multicallAddress: MULTICALL3_ADDRESS,
    contracts: [
      { address: pool.address, abi: POOL_VIEW_ABI, functionName: 'tokenA' },
      { address: pool.address, abi: POOL_VIEW_ABI, functionName: 'tokenB' },
      { address: pool.address, abi: POOL_VIEW_ABI, functionName: 'getReserves' },
      { address: tokenAInfo.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] },
      { address: tokenBInfo.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] },
    ],
  });

  const [tokenAR, tokenBR, reservesR, balAR, balBR] = results;

  if (tokenAR.status !== 'success' || tokenBR.status !== 'success' || reservesR.status !== 'success') {
    throw new Error(`Failed to read pool state for ${pool.tokenA}/${pool.tokenB}.`);
  }

  const onChainTokenA = tokenAR.result.toLowerCase();
  const [rawReserveA, rawReserveB] = reservesR.result;

  const ourTokenAIsOnChainA = tokenAInfo.address.toLowerCase() === onChainTokenA;
  const reserveARaw = ourTokenAIsOnChainA ? rawReserveA : rawReserveB;
  const reserveBRaw = ourTokenAIsOnChainA ? rawReserveB : rawReserveA;

  const balanceARaw = hasUser && balAR.status === 'success' ? balAR.result : 0n;
  const balanceBRaw = hasUser && balBR.status === 'success' ? balBR.result : 0n;

  return {
    pool,
    reserves: { [pool.tokenA]: reserveARaw, [pool.tokenB]: reserveBRaw },
    reservesFormatted: {
      [pool.tokenA]: formatUnits(reserveARaw, tokenAInfo.decimals),
      [pool.tokenB]: formatUnits(reserveBRaw, tokenBInfo.decimals),
    },
    balances: { [pool.tokenA]: balanceARaw, [pool.tokenB]: balanceBRaw },
    balancesFormatted: {
      [pool.tokenA]: formatUnits(balanceARaw, tokenAInfo.decimals),
      [pool.tokenB]: formatUnits(balanceBRaw, tokenBInfo.decimals),
    },
  };
}

export async function quoteSwap(payTokenSymbol, receiveTokenSymbol, amountInDecimalString, poolState) {
  if (!amountInDecimalString || parseFloat(amountInDecimalString) <= 0) return '0';

  const payInfo = getTokenBySymbol(payTokenSymbol);
  const receiveInfo = getTokenBySymbol(receiveTokenSymbol);
  const client = getPublicClient();

  const amountIn = parseUnits(amountInDecimalString, payInfo.decimals);
  const reserveIn = poolState.reserves[payTokenSymbol];
  const reserveOut = poolState.reserves[receiveTokenSymbol];

  if (!reserveIn || !reserveOut || reserveIn === 0n || reserveOut === 0n) return '0';

  const amountOut = await client.readContract({
    address: poolState.pool.address,
    abi: POOL_VIEW_ABI,
    functionName: 'getAmountOut',
    args: [amountIn, reserveIn, reserveOut],
  });

  return formatUnits(amountOut, receiveInfo.decimals);
}

async function approveIfNeeded(tokenAddress, account, amount, spenderAddress) {
  const publicClient = getPublicClient();
  const currentAllowance = await publicClient.readContract({
    address: tokenAddress, abi: ERC20_ABI, functionName: 'allowance',
    args: [account, spenderAddress],
  });

  if (currentAllowance >= amount) return null;

  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: tokenAddress, abi: ERC20_ABI, functionName: 'approve',
    args: [spenderAddress, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function executeSwap({ account, pool, payTokenSymbol, receiveTokenSymbol, amountIn, minAmountOut, onStatus }) {
  await ensureArcNetwork();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  const payInfo = getTokenBySymbol(payTokenSymbol);
  const receiveInfo = getTokenBySymbol(receiveTokenSymbol);

  const amountInRaw = parseUnits(amountIn, payInfo.decimals);
  const minAmountOutRaw = parseUnits(minAmountOut, receiveInfo.decimals);

  onStatus?.('Checking approval…');
  await approveIfNeeded(payInfo.address, account, amountInRaw, pool.address);

  let hash;

  if (pool.type === 'swap') {
    onStatus?.('Swapping…');
    hash = await walletClient.writeContract({
      account,
      chain: arcViemChain,
      address: pool.address,
      abi: ARROWSWAP_ABI,
      functionName: 'swap',
      args: [payInfo.address, amountInRaw, minAmountOutRaw],
    });
  } else if (pool.type === 'pool') {
    onStatus?.('Resolving pool direction…');
    const onChainTokenA = await publicClient.readContract({
      address: pool.address,
      abi: POOL_VIEW_ABI,
      functionName: 'tokenA',
    });

    const payIsOnChainA = payInfo.address.toLowerCase() === onChainTokenA.toLowerCase();
    const functionName = payIsOnChainA ? 'swapAForB' : 'swapBForA';

    onStatus?.('Swapping…');
    hash = await walletClient.writeContract({
      account,
      chain: arcViemChain,
      address: pool.address,
      abi: ARROWPOOL_ABI,
      functionName,
      args: [amountInRaw, minAmountOutRaw],
    });
  } else {
    throw new Error(`Unknown pool type "${pool.type}" for pool ${pool.key ?? pool.address}`);
  }

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}