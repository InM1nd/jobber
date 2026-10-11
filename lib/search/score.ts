import type { Cv, Job, JobSource, Profile } from '@prisma/client';
import { getPrisma } from '@/lib/db/prisma';
import { prefilterJob, type LocationTier, type PrefilterProfile } from '@/lib/jobs/prefilter';
import { AiUnavailableError, hasSharedAi, parseJsonLoose } from '@/lib/ai/gemini';
import { runAi } from '@/lib/ai/run';
import { BudgetExhaustedError } from '@/lib/ai/budget';
import { QuotaExceededError, quotaAllowance } from '@/lib/ai/quota';
import { SCORE_BATCH } from '@/lib/ai/limiter';
import { getGeminiKey } from '@/lib/data/keys';
import { priorityFromScore } from '@/lib/llm/matcher';
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
  .map(({ key, job }) => `<${key}> ${job.title} — ${job.company || job.source.company} (${job.location || (job.remote ? 'Remote' : 'n/a')})\n${job.description.replace(/\s+/g, ' ').slice(0, 1500)}`)
  .join('\n\n')}

Return {"results":[{"id":"<job id>","roleFit":0-100,"skills":0-100,"cv":"letter of best CV","reasons":["2 short concrete reasons"],"redFlags":["0-2 concrete concerns, e.g. missing must-have"]}]} with one entry per job.`;
}

export interface ScoreBatchResult {
  filtered: number;
  scored: number;
  /** passed the filter but still waiting for an AI score (quota/rate/time) */
  queued: number;
  stoppedBy: 'quota' | 'budget' | 'rate' | 'time' | 'no-ai' | null;
}

/** Scores up to SCORE_BATCH jobs in ONE AI request and stores the matches. */
export async function scoreJobs(
  userId: string,
  profile: Profile,
  cvs: CvLite[],
  items: Array<{ job: PoolJob; tier: LocationTier }>,
) {
  const prisma = getPrisma();
  const keyed = items.map((it, i) => ({ ...it, key: `j${i + 1}` }));
  const reply = await runAi(userId, 'score', rubricPrompt(profile, cvs, keyed), {
    tier: 'lite',
    system: RUBRIC_SYSTEM,
    json: true,
    temperature: 0.1,
    maxTokens: 400 + 260 * items.length,
    maxWaitMs: 8_000,
  });
  const scores = new Map(parseAiScores(parseJsonLoose(reply)).map((s) => [s.id.replace(/[<>]/g, ''), s]));
  let stored = 0;
  for (const { key, job, tier } of keyed) {
    const ai = scores.get(key);
    if (!ai) continue; // stays unscored → retried next time
    const sub: SubScores = {
      role: ai.roleFit,
      skills: ai.skills,
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

/**
 * Pre-filters every unseen job in the user's pool (free), then scores the most
 * relevant survivors (local first) in batches of SCORE_BATCH per AI request,
 * within the user's daily quota, the shared daily budget and a deadline.
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
    take: 600,
  });

  const filterProfile = profileForFilter(profile);
  const passing: Array<{ job: PoolJob; tier: LocationTier; relevance: number }> = [];
  const rejected: Array<{ jobId: string; reason: string; tier: LocationTier }> = [];
  for (const job of unseen) {
    const r = prefilterJob(filterProfile, { ...job, company: job.company || job.source.company });
    if (r.pass) passing.push({ job, tier: r.tier, relevance: r.relevance + (job.company ? 0 : 2) });
    else rejected.push({ jobId: job.id, reason: r.reason || 'Filtered', tier: r.tier });
  }
  if (rejected.length) {
    await prisma.jobMatch.createMany({
      data: rejected.map((r) => ({
        userId, jobId: r.jobId, score: 0, reasons: [], redFlags: [r.reason], priority: 'low', filtered: true, locationTier: r.tier,
      })),
      skipDuplicates: true,
    });
  }
  passing.sort((a, b) => b.relevance - a.relevance);

  const ownKey = Boolean(await getGeminiKey(userId));
  if (!ownKey && !hasSharedAi()) return { filtered: rejected.length, scored: 0, queued: passing.length, stoppedBy: 'no-ai' };
  if (!ownKey && (await sharedBackoffUntil())) return { filtered: rejected.length, scored: 0, queued: passing.length, stoppedBy: 'rate' };

  const cvs = await userCvs(userId, profile);
  const wantCalls = Math.min(opts.maxCalls, Math.ceil(passing.length / SCORE_BATCH));
  const calls = await quotaAllowance(userId, 'score', wantCalls, ownKey);
  const batches: Array<typeof passing> = [];
  for (let i = 0; i < calls; i++) batches.push(passing.slice(i * SCORE_BATCH, (i + 1) * SCORE_BATCH));
  let stoppedBy: ScoreBatchResult['stoppedBy'] = calls < wantCalls ? 'quota' : null;
  let scored = 0;
  let index = 0;
  let halt = false;

  async function worker() {
    while (!halt && index < batches.length) {
      if (Date.now() > opts.deadline) {
        stoppedBy = stoppedBy || 'time';
        return;
      }
      const batch = batches[index++];
      try {
        scored += await scoreJobs(userId, profile!, cvs, batch);
      } catch (error) {
        if (error instanceof QuotaExceededError) { halt = true; stoppedBy = 'quota'; return; }
        if (error instanceof BudgetExhaustedError) { halt = true; stoppedBy = 'budget'; return; }
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

  return { filtered: rejected.length, scored, queued: Math.max(0, passing.length - scored), stoppedBy };
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
