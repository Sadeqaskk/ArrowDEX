import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const INTERVALS: [string, number][] = [
  ['1m', 60], ['5m', 300], ['15m', 900], ['30m', 1800],
  ['1h', 3600], ['2h', 7200], ['4h', 14400], ['1d', 86400], ['5d', 432000],
];

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = getSupabaseServer();
  const results: Record<string, string> = {};

  for (const [label, seconds] of INTERVALS) {
    const { error } = await sb.rpc('refresh_candles', { p_interval: label, p_seconds: seconds });
    results[label] = error ? `error: ${error.message}` : 'ok';
  }
  const { error: monthlyError } = await sb.rpc('refresh_candles_monthly');
  results['1mo'] = monthlyError ? `error: ${monthlyError.message}` : 'ok';

  return NextResponse.json({ ok: true, results });
}