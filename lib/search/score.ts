import type { Cv, Job, JobSource, Profile } from '@prisma/client';
import { getPrisma } from '@/lib/db/prisma';
import { prefilterJob, type LocationTier, type PrefilterProfile } from '@/lib/jobs/prefilter';
import { AiUnavailableError, hasSharedAi, parseJsonLoose } from '@/lib/ai/gemini';
import { runAi } from '@/lib/ai/run';
import { BudgetExhaustedError } from '@/lib/ai/budget';
import { QuotaExceededError, quotaAllowance } from '@/lib/ai/quota';
import { SCORE_BATCH } from '@/lib/ai/limiter';
import { getGeminiKey } from '@/lib/data/keys';
import { scrapeDetail } from '@/lib/scrapers';
import { fetchByHost } from './hosts';
import { priorityFromScore } from '@/lib/llm/matcher';
import { blendSkills, classifyRequirements } from './requirements';
import {
  RUBRIC_SYSTEM, combine, languageScore, locationScore, parseAiScores, salaryScore, seniorityScore, type SubScores,
} from './rubric';

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

export function profileForFilter(p: Profile): PrefilterProfile {
  const [city] = (p.location || '').split(',').map((s) => s.trim());
  return {
    targetRoles: p.targetRoles,
    keywords: p.searchKeywords.length ? p.searchKeywords : p.stackKeywords,
    skills: p.skills.slice(0, 12),
    location: p.location,
    city: city || null,
    country: p.country,
    openTo: p.openTo,
    remoteOnly: p.remoteOnly,
    languages: p.languages,
    seniority: p.seniority,
    stretch: p.stretch,
    workField: p.workField,
    avoidKeywords: p.avoidKeywords,
    excludeCompanies: p.excludeCompanies,
    employmentTypes: p.employmentTypes,
    maxJobAgeDays: p.maxJobAgeDays,
  };
}

type PoolJob = Job & { source: JobSource };
type CvLite = Pick<Cv, 'id' | 'label' | 'text'>;

const LETTERS = 'ABCDEFGH';

export async function userCvs(userId: string, profile: Pick<Profile, 'cvText'>): Promise<CvLite[]> {
  const cvs = await getPrisma().cv.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { id: true, label: true, text: true } });
  if (cvs.length) return cvs.slice(0, LETTERS.length);
  return profile.cvText ? [{ id: '', label: 'CV', text: profile.cvText }] : [];
}

function cvDigest(cv: CvLite, i: number, budget: number) {
  return `[${LETTERS[i]}] "${cv.label}"\n${cv.text.replace(/\s+/g, ' ').slice(0, budget)}`;
}

export function rubricPrompt(profile: Profile, cvs: CvLite[], jobs: Array<{ key: string; job: PoolJob; tier: LocationTier }>) {
  const per = Math.max(900, Math.floor(4200 / Math.max(1, cvs.length)));
  return `CANDIDATE
Target roles: ${profile.targetRoles.join(', ') || 'see CVs'}
Field: ${profile.workField || '-'} · Level: ${profile.seniority || '-'}${profile.stretch ? ' (open to one level up)' : ''} · Years: ${profile.yearsExperience ?? '?'}
Skills: ${profile.skills.slice(0, 25).join(', ')}
Languages: ${profile.languages.join(', ')}
${profile.scoringInstructions ? `Candidate's own scoring rules (apply them to roleFit/skills): ${profile.scoringInstructions.slice(0, 1200)}\n` : ''}
CVS
${cvs.map((c, i) => cvDigest(c, i, per)).join('\n\n')}

JOBS
${jobs
  .map(({ key, job }) => `<${key}> ${job.title} — ${job.company || job.source.company} (${job.location || (job.remote ? 'Remote' : 'n/a')})\n${job.description.replace(/\s+/g, ' ').slice(0, 1200)}`)
  .join('\n\n')}

Return {"results":[{"id":"<job id>","roleFit":0-100,"skills":0-100,"cv":"letter of best CV","reasons":["2 short concrete reasons"],"redFlags":["0-2 concrete concerns, e.g. missing must-have"],"requirements":[{"text":"short requirement","must":true,"skill":"exact name from Skills or null"}]}]} with one entry per job.`;
}

export interface ScoreBatchResult {
  filtered: number;
  scored: number;
  /** good pre-score, still waiting for an AI score (quota/rate/time/per-run cap) */
  queued: number;
  /** AI requests made */
  calls: number;
  stoppedBy: 'quota' | 'budget' | 'rate' | 'time' | 'no-ai' | null;
}

/** Skipped-list marker for jobs that passed the rules and wait for an AI score. */
export const QUEUED_FLAG = 'Queued for AI scoring';
/** Minimum deterministic pre-score to be worth an AI request. */
export const PRE_MIN = Number(process.env.AI_PRESCORE_MIN || 40);
/** Max jobs sent to AI per search run (2 requests at SCORE_BATCH=12). */
export const TOP_PER_RUN = Number(process.env.AI_TOP_CANDIDATES || 24);

/** Scores up to SCORE_BATCH jobs in ONE AI request and stores the matches. */
export async function scoreJobs(
  userId: string,
  profile: Profile,
  cvs: CvLite[],
  items: Array<{ job: PoolJob; tier: LocationTier; preScore?: number | null }>,
) {
  const prisma = getPrisma();
  const keyed = items.map((it, i) => ({ ...it, key: `j${i + 1}` }));
  const reply = await runAi(userId, 'score', rubricPrompt(profile, cvs, keyed), {
    tier: 'lite',
    system: RUBRIC_SYSTEM,
    json: true,
    temperature: 0.1,
    maxTokens: 400 + 380 * items.length,
    maxWaitMs: 8_000,
  });
  let parsed: unknown = null;
  try {
    parsed = parseJsonLoose(reply);
  } catch {
    parsed = salvageResults(reply); // truncated/invalid JSON → keep the complete entries, rest stays queued
  }
  const scores = new Map(parseAiScores(parsed).map((s) => [s.id.replace(/[<>\s]/g, ''), s]));
  if (scores.size < items.length) console.warn(`AI returned ${scores.size}/${items.length} valid scores (reply ${reply.length} chars): ${reply.slice(-160).replace(/\s+/g, ' ')}`);
  let stored = 0;
  for (const { key, job, tier, preScore } of keyed) {
    const ai = scores.get(key);
    if (!ai) continue; // stays unscored → retried next time
    const requirements = classifyRequirements(ai.requirements, profile.skills, cvs.map((c) => c.text));
    const sub: SubScores = {
      role: ai.roleFit,
      skills: blendSkills(ai.skills, requirements),
      seniority: seniorityScore(profile, job.title, job.description),
      location: locationScore(tier),
      language: languageScore(profile.languages, job.description),
      salary: salaryScore(profile, job),
    };
    const score = combine(sub);
    const cvIndex = ai.cv ? LETTERS.indexOf(ai.cv[0]) : 0;
    const cv = cvs[cvIndex >= 0 && cvIndex < cvs.length ? cvIndex : 0];
    const data = {
      score,
      reasons: ai.reasons,
      redFlags: ai.redFlags,
      priority: priorityFromScore(score),
      filtered: false,
      cvId: cv?.id || null,
      locationTier: tier,
      subScores: sub,
      requirements: requirements.length ? (requirements as unknown as object) : undefined,
      preScore: preScore ?? null,
    };
    await prisma.jobMatch.upsert({
      where: { userId_jobId: { userId, jobId: job.id } },
      create: { userId, jobId: job.id, ...data },
      update: data,
    });
    stored++;
  }
  return stored;
}

/** Pulls complete {"id":…} objects out of a truncated or malformed JSON reply. */
export function salvageResults(reply: string) {
  const out: unknown[] = [];
  for (const m of reply.matchAll(/\{[^{}]*"id"\s*:[^{}]*\}/g)) {
    try {
      out.push(JSON.parse(m[0].replace(/,\s*([\]}])/g, '$1')));
    } catch {
      /* skip broken entry */
    }
  }
  return { results: out };
}

/** Fetches job pages for thin scraped candidates (per-host polite, parallel across hosts). Returns the ones updated. */
async function enrichThin(list: Candidate[], deadline: number): Promise<Candidate[]> {
  if (process.env.OWNER_SCRAPERS !== 'true') return [];
  const thin = list.filter((c) => c.job.source.sourceType.startsWith('scrape:') && c.job.description.trim().length < 300 && c.job.url);
  if (!thin.length) return [];
  const updated: Candidate[] = [];
  await fetchByHost(
    thin.slice(0, Number(process.env.SCRAPER_DETAILS_PER_RUN || 12)),
    (c) => c.job.source.sourceType,
    async (c) => {
      const text = await scrapeDetail(c.job.source.sourceType.replace(/^scrape:/, ''), c.job.url!).catch(() => '');
      if (text.length <= c.job.description.length) return;
      c.job = { ...c.job, description: text };
      await getPrisma().job.update({ where: { id: c.job.id }, data: { description: text } });
      updated.push(c);
    },
    deadline,
  );
  return updated;
}

type Candidate = { job: PoolJob; tier: LocationTier; preScore: number };

/**
 * Rules (free) drop clear mismatches; a deterministic pre-score ranks the rest.
 * Only the top candidates above PRE_MIN go to AI (SCORE_BATCH per request),
 * within the user's daily quota, the shared daily budget and a deadline.
 * Low pre-scores and not-yet-scored candidates are visible in Skipped
 * ("Score anyway"); queued ones are picked up by later runs/cron.
 */
export async function scoreUserBatch(
  userId: string,
  opts: { maxCalls: number; deadline: number; concurrency?: number; maxJobs?: number; minCandidates?: number },
): Promise<ScoreBatchResult> {
  const prisma = getPrisma();
  const empty: ScoreBatchResult = { filtered: 0, scored: 0, queued: 0, calls: 0, stoppedBy: null };
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) return empty;
  const where = poolWhere(profile);
  if (!where.OR.length) return empty;

  const [unseen, waiting] = await Promise.all([
    prisma.job.findMany({ where: { ...where, matches: { none: { userId } } }, include: { source: true }, orderBy: { createdAt: 'desc' }, take: 800 }),
    prisma.jobMatch.findMany({ where: { userId, filtered: true, redFlags: { has: QUEUED_FLAG } }, include: { job: { include: { source: true } } }, take: 300 }),
  ]);

  const filterProfile = profileForFilter(profile);
  const candidates: Candidate[] = [];
  const rejected: Array<{ jobId: string; reason: string; tier: LocationTier; preScore?: number }> = [];
  for (const job of [...unseen, ...waiting.map((w) => w.job)]) {
    const r = prefilterJob(filterProfile, { ...job, company: job.company || job.source.company });
    if (!r.pass) rejected.push({ jobId: job.id, reason: r.reason || 'Filtered', tier: r.tier });
    else if ((r.preScore ?? 0) < PRE_MIN) rejected.push({ jobId: job.id, reason: `Low pre-score (${r.preScore})`, tier: r.tier, preScore: r.preScore });
    else candidates.push({ job, tier: r.tier, preScore: r.preScore! });
  }
  candidates.sort((a, b) => b.preScore - a.preScore);
  const rows = (list: typeof rejected) =>
    list.map((r) => ({ userId, jobId: r.jobId, score: 0, reasons: [], redFlags: [r.reason], priority: 'low', filtered: true, locationTier: r.tier, preScore: r.preScore ?? null }));
  if (rejected.length) {
    await prisma.jobMatch.createMany({ data: rows(rejected), skipDuplicates: true });
    const waitingIds = new Set(waiting.map((w) => w.jobId));
    const changed = rejected.filter((r) => waitingIds.has(r.jobId));
    for (const r of changed) {
      await prisma.jobMatch.update({ where: { userId_jobId: { userId, jobId: r.jobId } }, data: { redFlags: [r.reason], preScore: r.preScore ?? null } });
    }
  }
  let newlyRejectedLate = 0;
  const newlyRejected = rejected.length - rejected.filter((r) => waiting.some((w) => w.jobId === r.jobId)).length;

  /** Leaves good-but-unscored candidates visible in Skipped and queued for later. */
  const park = async (list: Candidate[]) => {
    const fresh = list.filter((c) => !waiting.some((w) => w.jobId === c.job.id));
    if (!fresh.length) return;
    await prisma.jobMatch.createMany({
      data: fresh.map((c) => ({ userId, jobId: c.job.id, score: 0, reasons: [], redFlags: [QUEUED_FLAG], priority: 'low', filtered: true, locationTier: c.tier, preScore: c.preScore })),
      skipDuplicates: true,
    });
  };

  const cap = Math.max(0, opts.maxJobs ?? TOP_PER_RUN);
  // Scraped list entries carry only title/company/city: fetch the job page for the ones about to be scored, then re-check the rules.
  const enriched = await enrichThin(candidates.slice(0, cap), Math.min(opts.deadline - 12_000, Date.now() + (cap <= SCORE_BATCH ? 8_000 : 15_000)));
  for (const c of enriched) {
    const r = prefilterJob(filterProfile, { ...c.job, company: c.job.company || c.job.source.company });
    const i = candidates.indexOf(c);
    if (!r.pass || (r.preScore ?? 0) < PRE_MIN) {
      candidates.splice(i, 1);
      const reason = r.pass ? `Low pre-score (${r.preScore})` : r.reason || 'Filtered';
      await prisma.jobMatch.upsert({
        where: { userId_jobId: { userId, jobId: c.job.id } },
        create: { userId, jobId: c.job.id, score: 0, reasons: [], redFlags: [reason], priority: 'low', filtered: true, locationTier: r.tier, preScore: r.preScore ?? null },
        update: { redFlags: [reason], preScore: r.preScore ?? null },
      });
      newlyRejectedLate++;
    } else c.preScore = r.preScore!;
  }
  candidates.sort((a, b) => b.preScore - a.preScore);
  const take = candidates.slice(0, cap);
  const result = (scored: number, calls: number, stoppedBy: ScoreBatchResult['stoppedBy']): ScoreBatchResult => ({
    filtered: newlyRejected + newlyRejectedLate, scored, calls, queued: Math.max(0, candidates.length - scored), stoppedBy,
  });
  if (!take.length || take.length < (opts.minCandidates ?? 0)) {
    if (!opts.minCandidates) await park(candidates);
    return result(0, 0, null);
  }

  const ownKey = Boolean(await getGeminiKey(userId));
  if (!ownKey && !hasSharedAi()) { await park(candidates); return result(0, 0, 'no-ai'); }
  if (!ownKey && (await sharedBackoffUntil())) { await park(candidates); return result(0, 0, 'rate'); }

  const cvs = await userCvs(userId, profile);
  const wantCalls = Math.min(opts.maxCalls, Math.ceil(take.length / SCORE_BATCH));
  const calls = await quotaAllowance(userId, 'score', wantCalls, ownKey);
  // Spread evenly so 13 jobs become 7+6, not 12+1.
  const per = calls ? Math.ceil(Math.min(take.length, calls * SCORE_BATCH) / calls) : 0;
  const batches: Candidate[][] = [];
  for (let i = 0; i < calls; i++) batches.push(take.slice(i * per, (i + 1) * per));
  let stoppedBy: ScoreBatchResult['stoppedBy'] = calls < wantCalls ? 'quota' : null;
  let scored = 0;
  let made = 0;
  let index = 0;
  let halt = false;
  const done = new Set<string>();

  async function worker() {
    while (!halt && index < batches.length) {
      if (Date.now() > opts.deadline) {
        stoppedBy = stoppedBy || 'time';
        return;
      }
      const batch = batches[index++];
      try {
        made++;
        const n = await scoreJobs(userId, profile!, cvs, batch);
        scored += n;
        if (n) batch.forEach((c) => done.add(c.job.id));
      } catch (error) {
        if (error instanceof QuotaExceededError) { made--; halt = true; stoppedBy = 'quota'; return; }
        if (error instanceof BudgetExhaustedError) { made--; halt = true; stoppedBy = 'budget'; return; }
        if (error instanceof AiUnavailableError) {
          console.warn('scoring paused:', error.message, error.retryAfterMs ?? '');
          halt = true;
          stoppedBy = 'rate';
          if (!ownKey && error.fromServer && (error.retryAfterMs || 0) > 20_000) await setSharedBackoff(error.retryAfterMs!, error.message);
          return;
        }
        console.error('score batch failed', error instanceof Error ? error.message : error);
      }
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency ?? 2 }, worker));
  if (!opts.minCandidates || stoppedBy) await park(candidates.filter((c) => !done.has(c.job.id)));
  return result(scored, made, stoppedBy);
}

/** "Score anyway" for a job the filter skipped. One AI request. */
export async function scoreOne(userId: string, jobId: string) {
  const prisma = getPrisma();
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { source: true } });
  if (!profile || !job) return 0;
  const r = prefilterJob(profileForFilter(profile), { ...job, company: job.company || job.source.company });
  const tier: LocationTier = r.tier;
  return scoreJobs(userId, profile, await userCvs(userId, profile), [{ job, tier }]);
}
