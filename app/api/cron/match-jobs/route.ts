import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db/prisma';
import { scoreUserBatch } from '@/lib/search/score';

export const maxDuration = 60;

/**
 * Scores queued jobs on the shared Gemini key: pre-filter first (free), then
 * a few AI scores per user within their daily quota. Users with the most
 * unscored work go first; a 429 stops the run and the rest waits for next time.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  const deadline = started + 50_000;
  try {
    const users = await getPrisma().user.findMany({
      where: { profile: { isNot: null } },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });
    let scored = 0;
    let filtered = 0;
    let stopped: string | null = null;
    for (const user of users) {
      if (Date.now() > deadline - 5_000) break;
      const r = await scoreUserBatch(user.id, { maxCalls: 6, deadline, concurrency: 2 });
      scored += r.scored;
      filtered += r.filtered;
      if (r.stoppedBy === 'rate' || r.stoppedBy === 'no-ai') {
        stopped = r.stoppedBy;
        break;
      }
    }
    return NextResponse.json({ message: 'Matching complete', users: users.length, scored, filtered, stopped });
  } catch (error) {
    console.error('Match cron error', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to match jobs' }, { status: 500 });
  }
}
