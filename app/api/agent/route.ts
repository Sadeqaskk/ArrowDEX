// app/api/agent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { callGemini } from "@/lib/agent/gemini";
import { getPoolPrice } from "@/lib/agent/priceServer";
import { getLeaderboardPosition, getTotalVolume } from "@/lib/agent/supabaseQueries";
import { fetchActivity } from "@/lib/activity";

const SUPPORTED_SWAPS = new Set(["USDC-EURC", "EURC-USDC", "WUSDC-ARROW", "ARROW-WUSDC"]);
const SUPPORTED_BRIDGE_CHAINS = new Set(["Arc", "Ethereum Sepolia", "Base Sepolia"]);

export async function POST(req: NextRequest) {
  try {
    const { message, walletAddress, history } = await req.json();
    if (!message) return NextResponse.json({ type: "text", reply: "No message received." }, { status: 400 });

    const { functionCall, text } = await callGemini(message, history);

    if (!functionCall) {
      return NextResponse.json({ type: "text", reply: text ?? "I'm not sure — could you rephrase that?" });
    }

    const { name, args } = functionCall;

    switch (name) {
      case "swap": {
        const key = `${args.fromToken}-${args.toToken}`;
        if (args.fromToken === "cirBTC" || args.toToken === "cirBTC" || !SUPPORTED_SWAPS.has(key)) {
          return NextResponse.json({ type: "text", reply: `${args.fromToken} → ${args.toToken} swaps are coming soon.` });
        }
        return NextResponse.json({
          type: "action",
          action: "swap",
          params: args,
          reply: `Ready to swap ${args.amount} ${args.fromToken} → ${args.toToken}. Confirm in your wallet.`,
        });
      }

      case "bridge": {
        if (!SUPPORTED_BRIDGE_CHAINS.has(args.fromChain) || !SUPPORTED_BRIDGE_CHAINS.has(args.toChain)) {
          return NextResponse.json({ type: "text", reply: `Bridging to ${args.toChain} is coming soon — currently Arc, Ethereum Sepolia, and Base Sepolia are supported.` });
        }
        return NextResponse.json({
          type: "action",
          action: "bridge",
          params: args,
          reply: `Bridging ${args.amount} USDC from ${args.fromChain} to ${args.toChain}. Confirm in your wallet.`,
        });
      }

      case "getPrice": {
        if (args.pair === "USDC/cirBTC") {
          return NextResponse.json({ type: "text", reply: "USDC/cirBTC pricing is coming soon." });
        }
        const pairKey = args.pair === "WUSDC/ARROW" ? "WUSDC_ARROW" : "USDC_EURC";
        const price = await getPoolPrice(pairKey as any);
        if (!price) return NextResponse.json({ type: "text", reply: "No liquidity in that pool yet." });
        return NextResponse.json({
          type: "chart",
          pair: args.pair,
          price: price.price,
          reply: `${args.pair} is currently trading at ${price.price.toFixed(6)}.`,
        });
      }

      case "addLiquidity":
        if (args.pair === "USDC/cirBTC") return NextResponse.json({ type: "text", reply: "That pool is coming soon." });
        return NextResponse.json({ type: "action", action: "addLiquidity", params: args, reply: `Adding liquidity to ${args.pair}: ${args.amountA} + ${args.amountB}. Confirm in your wallet.` });

      case "removeLiquidity":
        return NextResponse.json({ type: "action", action: "removeLiquidity", params: args, reply: `Removing ${args.amount} LP from ${args.pair}. Confirm in your wallet.` });

      case "vaultAction":
        return NextResponse.json({ type: "action", action: `vault_${args.action}`, params: args, reply: `${args.action === "exit" ? "Exiting vault (withdraw + claim rewards)" : `${args.action}ing ${args.amount} ARROW-LP`}. Confirm in your wallet.` });

      
case "getActivity": {
  if (!walletAddress) return NextResponse.json({ type: "text", reply: "Connect your wallet first so I can look up your activity." });

  const allActivity = await fetchActivity(walletAddress);
  const targetDate = new Date(args.date + "T00:00:00Z");
  const nextDate = new Date(targetDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const activity = allActivity.filter((e) => {
    if (!e.timestamp) return false;
    return e.timestamp >= targetDate.getTime() && e.timestamp < nextDate.getTime();
  });

  return NextResponse.json({
    type: "activity",
    data: activity,
    reply: activity.length
      ? `You had ${activity.length} action(s) on ${args.date}: ${activity.map((a) => a.label).join(", ")}.`
      : `No activity found on ${args.date}.`,
  });
}

      case "getDocs": {
        const docsUrl = process.env.NEXT_PUBLIC_ARROWDEX_DOCS_URL;
        if (!docsUrl) {
          return NextResponse.json({ type: "text", reply: "Docs link isn't configured yet — check back soon." });
        }
        return NextResponse.json({ type: "link", url: docsUrl, reply: "Here's the ArrowDEX docs." });
      }

      case "getLeaderboardPosition": {
        if (!walletAddress) return NextResponse.json({ type: "text", reply: "Connect your wallet first so I can find your position." });
        const pos = await getLeaderboardPosition(walletAddress);
        if (!pos) return NextResponse.json({ type: "text", reply: "No trading history found for your wallet yet." });
        const rankText = pos.rank ? `rank #${pos.rank}` : "an unranked position (outside the top results)";
        return NextResponse.json({
          type: "leaderboard",
          data: pos,
          reply: `You're at ${rankText} with ${pos.volume} volume and ${pos.fees} in fees.`,
        });
      }

      case "getTotalVolume": {
        const vol = await getTotalVolume();
        return NextResponse.json({
          type: "volume",
          data: vol,
          reply: `ArrowDEX total volume: ${vol.allTime} across ${vol.totalTraders} traders and ${vol.totalTrades} trades.`,
        });
      }

      default:
        return NextResponse.json({ type: "text", reply: text ?? "I couldn't handle that request." });
    }
  } catch (err: any) {
    console.error("[/api/agent] error:", err);
    return NextResponse.json(
      { type: "text", reply: `Agent error: ${err?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }
}