import type { Profile } from '@prisma/client';
import { getPrisma } from '@/lib/db/prisma';
import { BudgetExhaustedError } from '@/lib/ai/budget';
import { AiUnavailableError } from '@/lib/ai/gemini';
import { parseAiMeta } from '@/lib/ai/meta';
import { QuotaExceededError, quotaAllowance } from '@/lib/ai/quota';
import { getGeminiKey } from '@/lib/data/keys';
import type { LocationTier } from '@/lib/jobs/prefilter';
import { QUEUED_FLAG, RESCORE_FLAG, scoreJobs, userCvs } from './score';

/** Profile fields the rules or the scorer read. Alerts, letters and salary-only edits don't need a re-score. */
const SCORED_FIELDS = [
  'workField', 'targetRoles', 'skills', 'location', 'country', 'openTo', 'remoteOnly', 'languages',
  'seniority', 'stretch', 'yearsExperience', 'employmentTypes', 'avoidKeywords', 'excludeCompanies', 'scoringInstructions', 'maxJobAgeDays',
] as const;

/** Whether a profile edit changes how jobs are filtered or scored. Pure. */
export function scoringChanged(before: Partial<Record<string, unknown>>, after: Partial<Record<string, unknown>>) {
  const norm = (v: unknown) => JSON.stringify(Array.isArray(v) ? [...v].map(String).sort() : v ?? null);
  return SCORED_FIELDS.some((k) => k in after && norm(before[k]) !== norm(after[k]));
}

/** How many of the best shown matches get re-scored after a change (AI requests: this / 12). */
const RESCORE_TOP = Number(process.env.AI_RESCORE_TOP || 24);

/**
 * After the profile or CVs change: jobs the rules skipped go back through the (free) rules,
 * and the best shown matches are queued for a new AI score. Nothing disappears until it's re-checked.
 */
export async function markForRescore(userId: string) {
  const prisma = getPrisma();
  await prisma.jobMatch.updateMany({
    where: { userId, filtered: true, NOT: { redFlags: { has: QUEUED_FLAG } }, job: { isActive: true } },
    data: { redFlags: [QUEUED_FLAG] },
  });
  const top = await prisma.jobMatch.findMany({
    where: { userId, filtered: false, job: { isActive: true }, NOT: { redFlags: { has: RESCORE_FLAG } } },
    orderBy: { score: 'desc' },
    take: RESCORE_TOP,
    select: { id: true },
  });
  if (top.length) await prisma.jobMatch.updateMany({ where: { id: { in: top.map((m) => m.id) } }, data: { redFlags: { push: RESCORE_FLAG } } });
  return top.length;
}

/** Score that earns the second look, and how many per user per day. */
const VERIFY_MIN = Number(process.env.AI_VERIFY_MIN || 70);
const VERIFY_TOP = Number(process.env.AI_VERIFY_TOP || 5);

/**
 * Second look at the newest strong matches with Flash (one request for up to VERIFY_TOP jobs),
 * so the scores you act on aren't flash-lite's alone. Uses one of the user's score requests and the
 * shared Flash budget (≈18/day for everyone); quietly does nothing when either is used up.
 */
export async function verifyTop(userId: string, profile: Profile): Promise<{ verified: number; stoppedBy: string | null }> {
  if (VERIFY_TOP <= 0) return { verified: 0, stoppedBy: null };
  const prisma = getPrisma();
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  const rows = await prisma.jobMatch.findMany({
    where: { userId, filtered: false, score: { gte: VERIFY_MIN }, updatedAt: { gte: since }, job: { isActive: true } },
    include: { job: { include: { source: true } } },
    orderBy: { score: 'desc' },
    take: 30,
  });
  const todo = rows.filter((m) => !parseAiMeta(m.aiMeta).verified && !m.redFlags.includes(RESCORE_FLAG)).slice(0, VERIFY_TOP);
  if (!todo.length) return { verified: 0, stoppedBy: null };
  const ownKey = Boolean(await getGeminiKey(userId));
  if (!(await quotaAllowance(userId, 'score', 1, ownKey))) return { verified: 0, stoppedBy: 'quota' };

  const started = new Date();
  try {
    await scoreJobs(
      userId,
      profile,
      await userCvs(userId, profile),
      todo.map((m) => ({ job: m.job, tier: (m.locationTier || 'other') as LocationTier, preScore: m.preScore })),
      { model: 'verify' },
    );
  } catch (e) {
    if (e instanceof QuotaExceededError) return { verified: 0, stoppedBy: 'quota' };
    if (e instanceof BudgetExhaustedError) return { verified: 0, stoppedBy: 'budget' };
    if (e instanceof AiUnavailableError) return { verified: 0, stoppedBy: 'rate' };
    throw e;
  }
  const after = await prisma.jobMatch.findMany({ where: { id: { in: todo.map((m) => m.id) }, updatedAt: { gte: started } }, select: { id: true, aiMeta: true } });
  const before = new Map(todo.map((m) => [m.id, m.score]));
  for (const m of after) {
    const meta = { ...parseAiMeta(m.aiMeta), verified: { at: new Date().toISOString(), before: before.get(m.id) ?? 0 } };
    await prisma.jobMatch.update({ where: { id: m.id }, data: { aiMeta: meta as object } });
  }
  return { verified: after.length, stoppedBy: null };
}
