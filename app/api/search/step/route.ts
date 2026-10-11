import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/data/service';
import { runView, stepSearchRun } from '@/lib/search/pipeline';

export const instant = false;
export const maxDuration = 60;

/** Advances the user's search run by one small step; the client calls this in a loop. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { runId } = (await request.json().catch(() => ({}))) as { runId?: string };
  if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  const run = await stepSearchRun(user.id, runId);
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  return NextResponse.json({ run: runView(run) });
}
