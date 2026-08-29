// lib/agent/supabaseQueries.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. Check your .env.local (and your deployment env settings)."
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function getUserActivity(wallet: string, dateISO: string) {
  const start = `${dateISO}T00:00:00Z`;
  const end = `${dateISO}T23:59:59Z`;
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .ilike("wallet_address", wallet)
    .gte("block_timestamp", start)
    .lte("block_timestamp", end)
    .order("block_timestamp", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getLeaderboardPosition(wallet: string) {
  const walletLower = wallet.toLowerCase();

  const { data: stats, error: statsError } = await supabase
    .from("wallet_stats")
    .select("*")
    .ilike("wallet", walletLower)
    .maybeSingle();
  if (statsError) throw statsError;
  if (!stats) return null;

  const { data: top, error: topError } = await supabase.rpc("leaderboard_top", {
    p_event_types: ["swap", "bridge_burn", "add_liquidity", "stake"],
    p_limit: 100000,
  });
  if (topError) throw topError;

  const idx = (top ?? []).findIndex((r: any) => r.wallet?.toLowerCase() === walletLower);
  const rank = idx === -1 ? null : idx + 1;

  return {
    rank,
    volume: stats.swap_volume,
    fees: stats.total_fees_paid,
  };
}

export async function getTotalVolume() {
  const { data, error } = await supabase.rpc("leaderboard_overview");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;

  return {
    allTime: row?.total_swap_volume ?? 0,
    totalTraders: row?.total_traders ?? 0,
    totalFees: row?.total_fees ?? 0,
    totalTrades: row?.total_trades ?? 0,
  };
}