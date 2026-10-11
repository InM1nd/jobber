import type { SearchRun } from '@prisma/client';
import { getPrisma } from '@/lib/db/prisma';
import { ingestSource } from '@/lib/jobs/ingest';
import { boardUrl, type SeedCompany } from '@/lib/companies/seed';
import { KEYWORD_BOARDS, keywordSourceUrl } from '@/lib/sources/boards';
import { sendTelegramMessage } from '@/lib/telegram/bot';
import { poolWhere, scoreUserBatch } from './score';

const FRESH_MS = 6 * 60 * 60 * 1000;

/** Creates (or reuses) JobSource rows for the plan. Returns their ids. */
export async function ensureSources(companies: SeedCompany[], keywords: string[]) {
  const prisma = getPrisma();
  const specs = [
    ...companies.map((c) => ({ company: c.name, sourceType: c.ats, sourceUrl: boardUrl(c), sector: c.tags[0] || null })),
    ...keywords.slice(0, 3).flatMap((k) =>
      KEYWORD_BOARDS.map((b) => ({
        company: `${b[0].toUpperCase()}${b.slice(1)} · ${k}`,
        sourceType: b,
        sourceUrl: keywordSourceUrl(b, k),
        sector: 'board',
      })),
    ),
  ];
  const ids: string[] = [];
  for (const spec of specs) {
    const row = await prisma.jobSource.upsert({
      where: { company_sourceUrl: { company: spec.company, sourceUrl: spec.sourceUrl } },
      create: spec,
      update: { isActive: true },
    });
    ids.push(row.id);
  }
  return ids;
}

export async function startSearchRun(userId: string) {
  const prisma = getPrisma();
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const watched = profile?.watchedCompanies.length
    ? await prisma.jobSource.findMany({ where: { company: { in: profile.watchedCompanies }, isActive: true }, select: { id: true } })
    : [];
  const sourceIds = [...new Set([...(profile?.sourceIds || []), ...watched.map((s) => s.id)])];
  return prisma.searchRun.create({ data: { userId, sourceIds, status: sourceIds.length ? 'fetching' : 'done' } });
}

export async function latestRun(userId: string) {
  return getPrisma().searchRun.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

export function runView(run: SearchRun | null) {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    sourcesTotal: run.sourceIds.length,
    sourcesDone: run.sourcesDone,
    jobsFound: run.jobsFound,
    filtered: run.filtered,
    scored: run.scored,
    queued: run.queued,
    note: run.note,
  };
}

/**
 * Advances a run by one small step (fits in a serverless request).
 * fetching: pull the next few sources (skipping ones fetched in the last 6h).
 * scoring: pre-filter + score a handful of jobs within quota.
 */
export async function stepSearchRun(userId: string, runId: string, budgetMs = 35_000) {
  const prisma = getPrisma();
  const started = Date.now();
  let run = await prisma.searchRun.findFirst({ where: { id: runId, userId } });
  if (!run) return null;
  if (run.status === 'done' || run.status === 'error') return run;

  if (run.status === 'fetching') {
    const batch = run.sourceIds.slice(run.sourcesDone, run.sourcesDone + 4);
    const sources = await prisma.jobSource.findMany({ where: { id: { in: batch } } });
    await Promise.all(
      sources.map((s) =>
        s.lastSuccessAt && Date.now() - s.lastSuccessAt.getTime() < FRESH_MS ? Promise.resolve(0) : ingestSource(s),
      ),
    );
    const sourcesDone = Math.min(run.sourceIds.length, run.sourcesDone + batch.length);
    const profile = await prisma.profile.findUnique({ where: { userId } });
    const jobsFound = profile ? await prisma.job.count({ where: poolWhere(profile) }) : 0;
    run = await prisma.searchRun.update({
      where: { id: run.id },
      data: { sourcesDone, jobsFound, status: sourcesDone >= run.sourceIds.length ? 'scoring' : 'fetching' },
    });
    return run;
  }

  // scoring
  const result = await scoreUserBatch(userId, {
    maxCalls: 9,
    deadline: started + budgetMs,
    concurrency: 3,
  });
  const done = result.queued === 0 || result.stoppedBy === 'quota' || result.stoppedBy === 'no-ai' || result.stoppedBy === 'rate';
  const note =
    result.stoppedBy === 'quota'
      ? 'Daily AI limit reached — the rest will be scored tomorrow.'
      : result.stoppedBy === 'rate'
        ? 'The shared AI is busy — the rest will be scored in the next run.'
        : result.stoppedBy === 'no-ai'
          ? 'AI is not configured on this server.'
          : null;
  run = await prisma.searchRun.update({
    where: { id: run.id },
    data: {
      filtered: { increment: result.filtered },
      scored: { increment: result.scored },
      queued: result.queued,
      status: done ? 'done' : 'scoring',
      note,
    },
  });
  if (done) await notifyRunDone(userId, run.id);
  return run;
}

async function notifyRunDone(userId: string, runId: string) {
  const prisma = getPrisma();
  const claimed = await prisma.searchRun.updateMany({ where: { id: runId, notifiedAt: null }, data: { notifiedAt: new Date() } });
  if (!claimed.count) return;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.telegramId) return;
  const top = await prisma.jobMatch.findMany({
    where: { userId, filtered: false },
    include: { job: { include: { source: true } } },
    orderBy: { score: 'desc' },
    take: 5,
  });
  if (!top.length) return;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://jobber-kohl.vercel.app';
  const lines = top.map((m, i) => `${i + 1}. ${m.score} · ${m.job.title} — ${m.job.company || m.job.source.company}\n${m.job.url}`);
  await sendTelegramMessage(
    user.telegramId,
    `Your first search is done. Top matches:\n\n${lines.join('\n\n')}\n\nAll matches: ${base}/dashboard/matches`,
  );
}
