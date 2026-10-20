import { NextRequest, NextResponse } from 'next/server';
import type { JobSource } from '@prisma/client';
import { getPrisma } from '@/lib/db/prisma';
import { ingestSource } from '@/lib/jobs/ingest';
import { sendDailyDigest } from '@/lib/telegram/bot';
import { recheckCareersOnly } from '@/lib/companies/recheck';
import { planRun, timeoutFor, withTimeout } from '@/lib/jobs/schedule';

export const maxDuration = 60;
// Same AWS region as Supabase (eu-west-1).
export const preferredRegion = 'dub1';

const CONCURRENCY = 6;
const BUDGET_MS = 50_000;
/** A source is due again after this long (the cron runs daily). */
const DUE_AFTER_MS = 20 * 3600 * 1000;
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const prisma = getPrisma();
  const started = Date.now();
  const force = req.nextUrl.searchParams.get('all') === '1';
  const only = req.nextUrl.searchParams.get('only'); // e.g. "scrape:stepstone" for a targeted test run
  try {
    // Weekly: careers-only companies -> public ATS board if their careers page now links one.
    const recheck = await recheckCareersOnly({ force: req.nextUrl.searchParams.get('recheck') === '1' }).catch((e) => [{ error: String(e) }]);
    const dueBefore = new Date(Date.now() - (force ? 0 : DUE_AFTER_MS));
    const due = await prisma.jobSource.findMany({
      where: { isActive: true, sourceType: only ? only : { not: 'manual' }, OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lt: dueBefore } }] },
      orderBy: [{ lastFetchedAt: { sort: 'asc', nulls: 'first' } }],
    });
    const queue = planRun(due);
    const stats = { due: due.length, processed: 0, ok: 0, failed: 0, timedOut: 0, jobsSeen: 0, newJobs: 0, skipped: 0 };
    const errors: Array<{ company: string; error: string }> = [];
    const jobsBefore = await prisma.job.count();

    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const remaining = BUDGET_MS - (Date.now() - started);
        const source = queue[next];
        const ms = Math.min(timeoutFor(source), remaining - 1500);
        if (ms < 8_000) return; // out of time: leave the rest for the next run
        next++;
        try {
          const seen = await withTimeout(ingestSource(source), ms, source.company);
          stats.processed++;
          stats.jobsSeen += seen;
          const row = await prisma.jobSource.findUnique({ where: { id: source.id }, select: { lastError: true } });
          if (row?.lastError) {
            stats.failed++;
            errors.push({ company: source.company, error: row.lastError.slice(0, 120) });
          } else stats.ok++;
        } catch (e) {
          stats.processed++;
          stats.timedOut++;
          const msg = e instanceof Error ? e.message : 'timeout';
          errors.push({ company: source.company, error: msg });
          await prisma.jobSource.update({ where: { id: source.id }, data: { lastFetchedAt: new Date(), lastError: msg.slice(0, 500) } }).catch(() => {});
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    stats.skipped = queue.length - stats.processed;
    stats.newJobs = (await prisma.job.count()) - jobsBefore;

    const remainingDue = stats.skipped;
    await prisma.cronJob.upsert({
      where: { name: 'fetch-jobs' },
      create: { name: 'fetch-jobs', currentBatch: 0, totalBatches: 0, lastRunAt: new Date(), lastStatus: 'success' },
      update: { currentBatch: 0, lastRunAt: new Date(), lastStatus: errors.length ? `success (${errors.length} source errors)` : 'success', lastError: errors.length ? JSON.stringify(errors).slice(0, 2000) : null },
    });

    // Daily digest once per day, from the scheduled run.
    let digests = 0;
    if (!force && !only) {
      const today = new Date().toISOString().slice(0, 10);
      const mark = await prisma.cronJob.findUnique({ where: { name: 'daily-digest' } });
      if (mark?.lastStatus !== today) {
        await prisma.cronJob.upsert({ where: { name: 'daily-digest' }, create: { name: 'daily-digest', lastStatus: today, lastRunAt: new Date() }, update: { lastStatus: today, lastRunAt: new Date() } });
        const users = await prisma.user.findMany({ where: { telegramId: { not: null } }, select: { id: true } });
        for (const user of users) {
          await sendDailyDigest(user.id).catch((e) => console.error('digest', e));
          digests++;
        }
      }
    }

    return NextResponse.json({ message: 'Run complete', ...stats, remainingDue, recheck, digests, ms: Date.now() - started, errors });
  } catch (error) {
    console.error('Cron job error:', error);
    await prisma.cronJob
      .upsert({
        where: { name: 'fetch-jobs' },
        create: { name: 'fetch-jobs', lastRunAt: new Date(), lastStatus: 'error', lastError: error instanceof Error ? error.message : 'Unknown error' },
        update: { lastRunAt: new Date(), lastStatus: 'error', lastError: error instanceof Error ? error.message : 'Unknown error' },
      })
      .catch(() => {});
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}
