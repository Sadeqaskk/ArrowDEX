import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(req: Request, { params }: { params: { address: string } }) {
  const wallet = params.address.toLowerCase();

  const { data, error } = await supabaseServer
    .from('wallet_stats')
    .select('*')
    .ilike('wallet', wallet)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // No activity yet is a valid state, not an error — return zeros instead of 404
  if (!data) {
    return NextResponse.json({
      wallet, swap_volume: 0, total_fees_paid: 0, bridge_volume: 0,
      lp_deposited: 0, staked_volume: 0, swap_count: 0, bridge_count: 0, last_active: null,
    });
  }
  return NextResponse.json(data);
}