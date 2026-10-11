import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/data/service';
import { getPrisma } from '@/lib/db/prisma';
import { scoreOne } from '@/lib/search/score';
import { aiErrorResponse } from '@/lib/ai/errors';

export const instant = false;
export const maxDuration = 60;

/** "Score anyway": run the AI on a job the filters skipped. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { id } = await context.params;
  const match = await getPrisma().jobMatch.findFirst({ where: { id, userId: user.id } });
  if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const n = await scoreOne(user.id, match.jobId);
    if (!n) return NextResponse.json({ error: 'The AI didn’t return a score. Try again in a minute.' }, { status: 502 });
    const updated = await getPrisma().jobMatch.findUnique({ where: { id } });
    return NextResponse.json({ score: updated?.score ?? null });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
