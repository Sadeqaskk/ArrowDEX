import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

const CATEGORY_EVENT_TYPES: Record<string, string[]> = {
  overall: ['swap', 'bridge_burn', 'add_liquidity', 'stake'],
  swap_bridge: ['swap', 'bridge_burn'],
  pool: ['add_liquidity', 'remove_liquidity'],
  vault: ['stake', 'unstake'],
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? 'overall';
  const limit = Number(searchParams.get('limit') ?? 10);

  const eventTypes = CATEGORY_EVENT_TYPES[category];
  if (!eventTypes) {
    return NextResponse.json({ error: `unknown category: ${category}` }, { status: 400 });
  }

  const { data, error } = await getSupabaseServer().rpc('leaderboard_top', {
    p_event_types: eventTypes,
    p_limit: limit,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category, results: data });
}