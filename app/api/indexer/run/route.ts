import { NextResponse } from 'next/server';
import { runOnce } from '@/lib/indexer/run';

export const runtime = 'nodejs';
export const maxDuration = 60; // seconds — bump on Vercel Pro if a run needs longer

export async function GET(req: Request) {
  // Optional but recommended: guard against anyone hitting this publicly
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const results = await runOnce();
  return NextResponse.json({ ok: true, results });
}