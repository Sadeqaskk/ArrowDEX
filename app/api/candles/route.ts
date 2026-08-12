import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const poolKey = searchParams.get('pool'); // 'usdcEurc' | 'wusdcArrow'
  const interval = searchParams.get('interval'); // '1m' | '5m' | ...
  const limit = Number(searchParams.get('limit') ?? 300);

  if (!poolKey || !interval) {
    return NextResponse.json({ error: 'pool and interval are required' }, { status: 400 });
  }

  const { data, error } = await getSupabaseServer()
    .from('candles')
    .select('bucket_start, open, high, low, close, volume, trade_count')
    .eq('pool_key', poolKey)
    .eq('interval', interval)
    .order('bucket_start', { ascending: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pool: poolKey, interval, candles: data });
}