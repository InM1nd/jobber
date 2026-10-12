import { linkApplications, notTracked } from '@/lib/tracker/link';
import type { SearchRun } from '@prisma/client';
import { getPrisma } from '@/lib/db/prisma';
import { ingestSource } from '@/lib/jobs/ingest';
import { boardUrl, type SeedCompany } from '@/lib/companies/seed';
import { LOCAL_BOARDS, boardsFor, keywordSourceUrl, type KeywordBoard } from '@/lib/sources/boards';
import { sendTelegramMessage } from '@/lib/telegram/bot';
import { poolWhere, scoreUserBatch, TOP_PER_RUN } from './score';
import { SCORE_BATCH } from '@/lib/ai/limiter';
import { fetchByHost, hostKey } from './hosts';
export { fetchByHost, hostKey };

const FRESH_MS = 6 * 60 * 60 * 1000;
/** Sources per run: targeted scrapers/boards and city companies come first in profile.sourceIds. */
const MAX_RUN_SOURCES = Number(process.env.MAX_RUN_SOURCES || 30);
/** The first fetch step stops early so the first AI batch (and first matches) arrive fast. */
const FIRST_STEP_MS = Number(process.env.FIRST_STEP_MS || 12_000);

export interface SourceSpec {
  company: string;
  sourceType: string;
  sourceUrl: string;
  sector: string | null;
}

/**
 * Specs for a plan, ordered by location priority: local boards and companies
 * hiring in the user's city first, then country, then remote boards.
 */
export function sourceSpecs(
  companies: Array<Pick<SeedCompany, 'name' | 'ats' | 'slug' | 'cities' | 'countries' | 'tags'> & { remoteShare?: number }>,
  keywords: string[],
  place: { city?: string | null; country?: string | null; remote: boolean },
): SourceSpec[] {
  const city = (place.city || '').toLowerCase();
  const country = (place.country || '').toLowerCase();
  const rank = (c: (typeof companies)[number]) =>
    c.cities.some((x) => x.toLowerCase() === city) ? 0 : c.countries.some((x) => x.toLowerCase() === country) ? 1 : 2;
  const boards = boardsFor({ country: place.country, remote: place.remote });
  const kw = keywords.slice(0, 3);
  const local = boards.filter((b) => LOCAL_BOARDS.includes(b));
  const remote = boards.filter((b) => !LOCAL_BOARDS.includes(b));
  const board = (b: KeywordBoard, k: string): SourceSpec => ({
    company: `${b[0].toUpperCase()}${b.slice(1)} · ${k}${LOCAL_BOARDS.includes(b) && place.city ? ` · ${place.city}` : ''}`,
    sourceType: b,
    sourceUrl: keywordSourceUrl(b, k, place),
    sector: 'board',
  });
  const company = (c: (typeof companies)[number]): SourceSpec => ({
    company: c.name, sourceType: c.ats, sourceUrl: boardUrl(c), sector: c.tags[0] || null,
  });
  const sorted = [...companies].sort((a, b) => rank(a) - rank(b));
  return [
    ...kw.flatMap((k) => local.map((b) => board(b, k))),
    ...sorted.filter((c) => rank(c) < 2).map(company),
    ...sorted.filter((c) => rank(c) === 2).map(company),
    // Remote feeds are broad: two keywords cover them (the third mostly returns duplicates).
    ...kw.slice(0, 2).flatMap((k) => remote.map((b) => board(b, k))),
  ];
}

/** Creates (or reuses) JobSource rows. Returns their ids in the given order. */
export async function ensureSourceRows(specs: SourceSpec[]) {
  const prisma = getPrisma();
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

/** Keyword-board sources only (companies are managed separately by the watch list). */
export async function ensureBoardSources(keywords: string[], place: { city?: string | null; country?: string | null; remote: boolean }) {
  return ensureSourceRows(sourceSpecs([], keywords, place));
}

export async function startSearchRun(userId: string) {
  const prisma = getPrisma();
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const watched = profile?.watchedCompanies.length
    ? await prisma.jobSource.findMany({ where: { company: { in: profile.watchedCompanies }, isActive: true }, select: { id: true } })
    : [];
  const sourceIds = [...new Set([...(profile?.sourceIds || []), ...watched.map((s) => s.id)])].slice(0, MAX_RUN_SOURCES);
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
    aiCalls: run.aiCalls,
    firstMatchAt: run.firstMatchAt?.toISOString() ?? null,
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

  const noteFor = (stoppedBy: string | null) =>
    stoppedBy === 'quota'
      ? 'Your daily AI limit is used — the rest is scored tomorrow (or add your own free Gemini key in Settings).'
      : stoppedBy === 'budget'
        ? 'The shared AI used today’s free quota — the rest is scored tomorrow.'
        : stoppedBy === 'rate'
          ? 'The shared AI is busy — the rest will be scored in the next run.'
          : stoppedBy === 'no-ai'
            ? 'AI is not configured on this server.'
            : null;

  if (run.status === 'fetching') {
    const first = run.doneSourceIds.length === 0;
    const deadline = started + (first ? FIRST_STEP_MS : Math.max(10_000, budgetMs - 10_000));
    const remaining = run.sourceIds.filter((id) => !run!.doneSourceIds.includes(id));
    const sources = await prisma.jobSource.findMany({ where: { id: { in: remaining } } });
    const order = new Map(remaining.map((id, i) => [id, i]));
    sources.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    const fetched = await fetchByHost(
      sources,
      hostKey,
      (s) => (s.lastSuccessAt && Date.now() - s.lastSuccessAt.getTime() < FRESH_MS ? Promise.resolve(0) : ingestSource(s)),
      deadline,
    );
    const doneSourceIds = [...run.doneSourceIds, ...fetched.map((s) => s.id)];
    const allFetched = doneSourceIds.length >= run.sourceIds.length || !sources.length;
    const profile = await prisma.profile.findUnique({ where: { userId } });
    const jobsFound = profile ? await prisma.job.count({ where: poolWhere(profile) }) : 0;
    // Progressive: score one batch of the best candidates found so far, while the rest is still fetching.
    let early = { filtered: 0, scored: 0, queued: 0, calls: 0, stoppedBy: null as string | null };
    if (!allFetched && run.scored === 0 && !run.note) {
      early = await scoreUserBatch(userId, { maxCalls: 1, deadline: started + budgetMs, concurrency: 1, maxJobs: SCORE_BATCH, minCandidates: 6 });
    }
    run = await prisma.searchRun.update({
      where: { id: run.id },
      data: {
        doneSourceIds,
        sourcesDone: Math.min(run.sourceIds.length, doneSourceIds.length),
        jobsFound,
        status: allFetched ? 'scoring' : 'fetching',
        filtered: { increment: early.filtered },
        scored: { increment: early.scored },
        aiCalls: { increment: early.calls },
        queued: early.queued,
        ...(early.scored && !run.firstMatchAt ? { firstMatchAt: new Date() } : {}),
        ...(early.stoppedBy ? { note: noteFor(early.stoppedBy) } : {}),
      },
    });
    return run;
  }

  // scoring: the best remaining candidates, capped per run so the shared AI budget lasts.
  // The first batch is its own step so the first matches show up before the second AI call.
  const firstBatch = run.scored === 0 && run.aiCalls === 0;
  const left = Math.max(0, TOP_PER_RUN - run.scored);
  const result = await scoreUserBatch(userId, {
    maxCalls: firstBatch ? 1 : Math.max(1, Math.ceil(left / SCORE_BATCH)),
    deadline: started + budgetMs,
    concurrency: 2,
    maxJobs: firstBatch ? Math.min(left, SCORE_BATCH) : left,
    ...(firstBatch ? { minCandidates: 1 } : {}),
  });
  const more = firstBatch && !result.stoppedBy && result.scored > 0 && result.queued > 0 && left > SCORE_BATCH;
  const done = result.stoppedBy !== 'time' && !more;
  run = await prisma.searchRun.update({
    where: { id: run.id },
    data: {
      filtered: { increment: result.filtered },
      scored: { increment: result.scored },
      aiCalls: { increment: result.calls },
      queued: Math.max(0, result.queued),
      status: done ? 'done' : 'scoring',
      note: noteFor(result.stoppedBy) ?? run.note,
      ...(result.scored && !run.firstMatchAt ? { firstMatchAt: new Date() } : {}),
    },
  });
  if (done) await notifyRunDone(userId, run.id);
  return run;
}

async function notifyRunDone(userId: string, runId: string) {
  const prisma = getPrisma();
  const claimed = await prisma.searchRun.updateMany({ where: { id: runId, notifiedAt: null }, data: { notifiedAt: new Date() } });
  if (!claimed.count) return;
  const [user, profile, runs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.searchRun.count({ where: { userId } }),
  ]);
  if (!user?.telegramId || profile?.alertFrequency === 'off') return;
  // First run always reports; later runs only for "instant" alerts (daily digest covers the rest).
  if (runs > 1 && profile?.alertFrequency !== 'instant') return;
  const threshold = runs > 1 ? profile?.alertThreshold ?? 70 : 0;
  const run = await prisma.searchRun.findUnique({ where: { id: runId } });
  await linkApplications(userId).catch(() => []);
  const top = await prisma.jobMatch.findMany({
    where: { userId, filtered: false, ...notTracked(userId), score: { gte: threshold }, ...(runs > 1 && run ? { createdAt: { gte: run.createdAt } } : {}) },
    include: { job: { include: { source: true } } },
    orderBy: { score: 'desc' },
    take: 5,
  });
  if (!top.length) return;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://jobber-kohl.vercel.app';
  const lines = top.map((m, i) => `${i + 1}. ${m.score} · ${m.job.title} — ${m.job.company || m.job.source.company}\n${m.job.url}`);
  await sendTelegramMessage(
    user.telegramId,
    `${runs > 1 ? 'New matches' : 'Your first search is done. Top matches'}:\n\n${lines.join('\n\n')}\n\nAll matches: ${base}/dashboard/matches`,
  );
}
