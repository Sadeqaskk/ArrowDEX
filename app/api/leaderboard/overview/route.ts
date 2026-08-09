import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET() {
  const { data, error } = await supabaseServer.rpc('leaderboard_overview');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}