import { createPublicClient, createWalletClient, http, defineChain, formatUnits, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CHAINS } from '@/lib/chains';
import { POOLS, ERC20_ABI, getPoolAbi, getTokenBySymbol } from '@/lib/swapConfig';

const arc = CHAINS.arcTestnet;

const arcViemChain = defineChain({
  id: arc.chainId,
  name: arc.name,
  nativeCurrency: arc.nativeCurrency,
  rpcUrls: { default: { http: [arc.rpcUrl] } },
});

const publicClient = createPublicClient({ chain: arcViemChain, transport: http(arc.rpcUrl) });

// Tunables — keep trades small; each bot only spends a slice of its own balance,
// and the price-impact check refuses to trade a pool it would meaningfully move yes.
const MIN_TRADE_PCT = 0.01; // 1% of the bot's balance in the token it's selling
const MAX_TRADE_PCT = 0.04; // 4%
const MAX_PRICE_IMPACT_BPS = 300n; // 3% — skip rather than worsen a skewed pool
const MIN_TOKEN_BALANCE_TO_TRADE = 1; // human units; skip if below this
const SKIP_PROBABILITY = 0.3; // ~30% of cron ticks a bot does nothing, so it doesn't look robotic

type BotConfig = { name: string; privateKeyEnv: string };

const BOTS: BotConfig[] = [
  { name: 'bot1', privateKeyEnv: 'BOT1_PRIVATE_KEY' },
  { name: 'bot2', privateKeyEnv: 'BOT2_PRIVATE_KEY' },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function approveIfNeeded(
  walletClient: ReturnType<typeof createWalletClient>,
  account: `0x${string}`,
  tokenAddress: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint
) {
  const allowance = (await publicClient.readContract({
    address: tokenAddress, abi: ERC20_ABI, functionName: 'allowance', args: [account, spender],
  })) as bigint;
  if (allowance >= amount) return null;
  const hash = await walletClient.writeContract({
    account, chain: arcViemChain, address: tokenAddress, abi: ERC20_ABI, functionName: 'approve', args: [spender, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function tradeOnce(bot: BotConfig) {
  if (Math.random() < SKIP_PROBABILITY) {
    return { bot: bot.name, skipped: true, reason: 'random idle tick' };
  }

  const privateKey = process.env[bot.privateKeyEnv];
  if (!privateKey) {
    return { bot: bot.name, skipped: true, reason: `missing ${bot.privateKeyEnv}` };
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: arcViemChain, transport: http(arc.rpcUrl) });

  const pool = pickRandom(POOLS);
  const flip = Math.random() < 0.5;
  const symbolIn = flip ? pool.tokenA : pool.tokenB;
  const symbolOut = flip ? pool.tokenB : pool.tokenA;
  const tokenIn = getTokenBySymbol(symbolIn)!;
  const tokenOut = getTokenBySymbol(symbolOut)!;
  const abi = getPoolAbi(pool);

  const [reserveARaw, reserveBRaw] = (await publicClient.readContract({
    address: pool.address as `0x${string}`, abi, functionName: 'getReserves',
  })) as [bigint, bigint];

  // getReserves() returns values in the CONTRACT's own tokenA/tokenB order —
  // resolve which is which by address rather than trusting our config's ordering.
  const [onchainTokenA] = await Promise.all([
    publicClient.readContract({ address: pool.address as `0x${string}`, abi, functionName: 'tokenA' }) as Promise<string>,
  ]);
  const inIsOnchainA = onchainTokenA.toLowerCase() === (tokenIn.address as string).toLowerCase();
  const reserveIn = inIsOnchainA ? reserveARaw : reserveBRaw;
  const reserveOut = inIsOnchainA ? reserveBRaw : reserveARaw;

  const balanceRaw = (await publicClient.readContract({
    address: tokenIn.address as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address],
  })) as bigint;

  const balanceHuman = Number(formatUnits(balanceRaw, tokenIn.decimals));
  if (balanceHuman < MIN_TOKEN_BALANCE_TO_TRADE) {
    return { bot: bot.name, skipped: true, reason: `low ${tokenIn.symbol} balance (${balanceHuman.toFixed(4)})` };
  }

  const pct = MIN_TRADE_PCT + Math.random() * (MAX_TRADE_PCT - MIN_TRADE_PCT);
  const amountInHuman = balanceHuman * pct;
  const amountIn = parseUnits(amountInHuman.toFixed(tokenIn.decimals), tokenIn.decimals);
  if (amountIn === 0n) {
    return { bot: bot.name, skipped: true, reason: 'trade size rounded to 0' };
  }

  const amountOut = (await publicClient.readContract({
    address: pool.address as `0x${string}`, abi, functionName: 'getAmountOut',
    args: [amountIn, reserveIn, reserveOut],
  })) as bigint;

  // Price impact vs. current spot price, normalized to a common 1e18 scale so
  // 6-decimal and 18-decimal pools compare fairly.
  const spotPriceX18 = (reserveOut * 10n ** 18n) / reserveIn;
  const execPriceX18 =
    (amountOut * 10n ** BigInt(tokenIn.decimals) * 10n ** 18n) / (amountIn * 10n ** BigInt(tokenOut.decimals));
  const impactBps = spotPriceX18 > 0n ? ((spotPriceX18 - execPriceX18) * 10_000n) / spotPriceX18 : 0n;
  if (impactBps > MAX_PRICE_IMPACT_BPS) {
    return { bot: bot.name, skipped: true, reason: `price impact too high (${impactBps} bps)` };
  }

  const minAmountOut = (amountOut * 99n) / 100n; // 1% slippage tolerance

  await approveIfNeeded(walletClient, account.address, tokenIn.address as `0x${string}`, pool.address as `0x${string}`, amountIn);

  let hash: `0x${string}`;
  if (pool.type === 'swap') {
    hash = await walletClient.writeContract({
      account, chain: arcViemChain, address: pool.address as `0x${string}`, abi, functionName: 'swap',
      args: [tokenIn.address, amountIn, minAmountOut],
    });
  } else {
    hash = await walletClient.writeContract({
      account, chain: arcViemChain, address: pool.address as `0x${string}`, abi,
      functionName: inIsOnchainA ? 'swapAForB' : 'swapBForA',
      args: [amountIn, minAmountOut],
    });
  }

  await publicClient.waitForTransactionReceipt({ hash });

  return {
    bot: bot.name,
    skipped: false,
    pool: pool.key,
    tokenIn: tokenIn.symbol,
    tokenOut: tokenOut.symbol,
    amountIn: amountInHuman,
    hash,
  };
}

export async function runOnce() {
  const results = [];
  for (const bot of BOTS) {
    try {
      results.push(await tradeOnce(bot));
    } catch (err: any) {
      results.push({ bot: bot.name, skipped: true, error: err.message || String(err) });
    }
  }
  return results;
}
