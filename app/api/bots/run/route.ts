import { NextResponse } from 'next/server';
import { runOnce } from '@/lib/botRunner';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');

  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results = await runOnce();

  return NextResponse.json({ ok: true, results });
}
