import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db/prisma';
import { scoreUserBatch } from '@/lib/search/score';
import { verifyTop } from '@/lib/search/rescore';

export const maxDuration = 60;

/**
 * Scores queued jobs on the shared Gemini key: pre-filter first (free), then
 * a few AI scores per user within their daily quota. Users with the most
 * unscored work go first; a 429 stops the run and the rest waits for next time.
 * Runs after each fetch slot (09:00 and 15:00 UTC), then gives the newest strong
 * matches a second look with Flash while time and the Flash budget last.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  const deadline = started + 50_000;
  try {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
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

    let verified = 0;
    if (!stopped) {
      for (const user of users) {
        if (Date.now() > deadline - 12_000) break;
        const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
        if (!profile) continue;
        const v = await verifyTop(user.id, profile).catch((e) => {
          console.error('verify', e instanceof Error ? e.message : e);
          return { verified: 0, stoppedBy: 'error' };
        });
        verified += v.verified;
        if (v.stoppedBy === 'budget' || v.stoppedBy === 'rate') break;
      }
    }
    return NextResponse.json({ message: 'Matching complete', users: users.length, scored, filtered, verified, stopped });
  } catch (error) {
    console.error('Match cron error', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to match jobs' }, { status: 500 });
  }
}
