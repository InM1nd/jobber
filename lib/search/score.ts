import type { Profile } from '@prisma/client';
import { getPrisma } from '@/lib/db/prisma';
import { prefilterJob } from '@/lib/jobs/prefilter';
import { matchJob } from '@/lib/llm/matcher';
import { sharedChatClient } from '@/lib/ai/shared-client';
import { AiUnavailableError, hasSharedAi } from '@/lib/ai/gemini';
import { addUsage, quotaAllowance } from '@/lib/ai/quota';

const BACKOFF_ROW = 'gemini-backoff';

/** Cross-instance backoff after Gemini 429s (stored in CronJob.lastRunAt as "blocked until"). */
export async function sharedBackoffUntil(): Promise<Date | null> {
  const row = await getPrisma().cronJob.findUnique({ where: { name: BACKOFF_ROW } });
  return row?.lastRunAt && row.lastRunAt > new Date() ? row.lastRunAt : null;
}

async function setSharedBackoff(ms: number, reason: string) {
  const until = new Date(Date.now() + ms);
  await getPrisma().cronJob.upsert({
    where: { name: BACKOFF_ROW },
    create: { name: BACKOFF_ROW, lastRunAt: until, lastStatus: 'backoff', lastError: reason },
    update: { lastRunAt: until, lastStatus: 'backoff', lastError: reason },
  });
}

/** Jobs this user's search covers: their own sources + watched companies. */
export function poolWhere(profile: Pick<Profile, 'sourceIds' | 'watchedCompanies'>) {
  return {
    isActive: true,
    OR: [
      ...(profile.sourceIds.length ? [{ sourceId: { in: profile.sourceIds } }] : []),
      ...(profile.watchedCompanies.length ? [{ source: { company: { in: profile.watchedCompanies } } }] : []),
    ],
  };
}

export function profileForFilter(p: Profile) {
  return {
    targetRoles: p.targetRoles,
    keywords: p.searchKeywords.length ? p.searchKeywords : p.stackKeywords,
    skills: p.skills.slice(0, 12),
    location: p.location,
    remoteOnly: p.remoteOnly,
    languages: p.languages,
    seniority: p.seniority,
  };
}

export interface ScoreBatchResult {
  filtered: number;
  scored: number;
  /** passed the filter but still waiting for an AI score (quota/rate/time) */
  queued: number;
  stoppedBy: 'quota' | 'rate' | 'time' | 'no-ai' | null;
}

/**
 * Pre-filters every unseen job in the user's pool (free), then scores the most
 * relevant survivors with the lite model, within the user's daily quota and a
 * wall-clock deadline. Whatever is left stays unmatched and is picked up by the
 * next step / cron run.
 */
export async function scoreUserBatch(
  userId: string,
  opts: { maxCalls: number; deadline: number; concurrency?: number },
): Promise<ScoreBatchResult> {
  const prisma = getPrisma();
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) return { filtered: 0, scored: 0, queued: 0, stoppedBy: null };
  const where = poolWhere(profile);
  if (!where.OR.length) return { filtered: 0, scored: 0, queued: 0, stoppedBy: null };

  const unseen = await prisma.job.findMany({
    where: { ...where, matches: { none: { userId } } },
    include: { source: true },
    orderBy: { createdAt: 'desc' },
    take: 400,
  });

  const filterProfile = profileForFilter(profile);
  const passing: Array<{ job: (typeof unseen)[number]; relevance: number }> = [];
  const rejected: Array<{ jobId: string; reason: string }> = [];
  for (const job of unseen) {
    const r = prefilterJob(filterProfile, job);
    // Jobs from the watched companies' own boards first, then aggregators.
    if (r.pass) passing.push({ job, relevance: r.relevance + (job.company ? 0 : 4) });
    else rejected.push({ jobId: job.id, reason: r.reason || 'Filtered' });
  }
  if (rejected.length) {
    await prisma.jobMatch.createMany({
      data: rejected.map((r) => ({
        userId, jobId: r.jobId, score: 0, reasons: [], redFlags: [r.reason], priority: 'low', filtered: true,
      })),
      skipDuplicates: true,
    });
  }
  passing.sort((a, b) => b.relevance - a.relevance);

  if (!hasSharedAi()) return { filtered: rejected.length, scored: 0, queued: passing.length, stoppedBy: 'no-ai' };
  if (await sharedBackoffUntil()) return { filtered: rejected.length, scored: 0, queued: passing.length, stoppedBy: 'rate' };

  const allowed = await quotaAllowance(userId, 'score', Math.min(opts.maxCalls, passing.length));
  const todo = passing.slice(0, allowed);
  const client = sharedChatClient('lite', 8_000);
  let scored = 0;
  let stoppedBy: ScoreBatchResult['stoppedBy'] = allowed < Math.min(opts.maxCalls, passing.length) ? 'quota' : null;

  const profileForAi = {
    cvText: profile.cvText || undefined,
    skills: profile.skills,
    location: profile.location || undefined,
    remoteOnly: profile.remoteOnly,
    languages: profile.languages,
    salaryMin: profile.salaryMin || undefined,
    salaryMax: profile.salaryMax || undefined,
    stackKeywords: profile.stackKeywords.length ? profile.stackKeywords : profile.searchKeywords,
    skillGaps: profile.skillGaps,
  };

  let index = 0;
  let halt = false;
  async function worker() {
    while (!halt && index < todo.length) {
      if (Date.now() > opts.deadline) {
        stoppedBy = stoppedBy || 'time';
        return;
      }
      const { job } = todo[index++];
      try {
        const result = await matchJob(client, profileForAi, {
          title: job.title,
          company: job.company || job.source.company,
          location: job.location || undefined,
          remote: job.remote,
          description: job.description,
          requirements: job.requirements || undefined,
          salaryMin: job.salaryMin || undefined,
          salaryMax: job.salaryMax || undefined,
        });
        if (result.reasons[0] === 'The model did not return a usable score.') continue; // retry later
        await prisma.jobMatch.upsert({
          where: { userId_jobId: { userId, jobId: job.id } },
          create: { userId, jobId: job.id, ...result },
          update: { ...result, filtered: false },
        });
        await addUsage(userId, 'score', 1);
        scored++;
      } catch (error) {
        if (error instanceof AiUnavailableError) {
          console.warn('scoring paused:', error.message, error.retryAfterMs ?? '');
          halt = true;
          stoppedBy = 'rate';
          if (error.fromServer && (error.retryAfterMs || 0) > 20_000) await setSharedBackoff(error.retryAfterMs!, error.message);
          return;
        }
        console.error('score failed', job.id, error instanceof Error ? error.message : error);
      }
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency ?? 3 }, worker));

  return { filtered: rejected.length, scored, queued: passing.length - scored, stoppedBy };
}
