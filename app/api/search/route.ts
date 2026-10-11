import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/data/service';
import { latestRun, runView, startSearchRun } from '@/lib/search/pipeline';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ run: null });
  return NextResponse.json({ run: runView(await latestRun(user.id)) });
}

/** Start a fresh run (e.g. "Search again"). */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: 'Not available in demo mode' }, { status: 503 });
  const current = await latestRun(user.id);
  if (current && (current.status === 'fetching' || current.status === 'scoring') && Date.now() - current.updatedAt.getTime() < 10 * 60_000) {
    return NextResponse.json({ run: runView(current) });
  }
  return NextResponse.json({ run: runView(await startSearchRun(user.id)) });
}
