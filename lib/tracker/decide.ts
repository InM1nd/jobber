import { getPrisma } from '@/lib/db/prisma';
import { parseAiMeta, type AiMeta, type SwipeDecision } from '@/lib/ai/meta';
import { normalizeUrl, isGenericCareersUrl } from '@/lib/jobs/dedupe';
import { companyRoleKey } from '@/lib/agent/api';
import { USER_SKIP_FLAG } from '@/lib/search/flags';
import { SKIP_REASONS } from './skip';

/**
 * Review decisions: one swipe = one decision.
 * apply → a tracker row (linked to the job, carrying Jobber's score and reasons), letter + Telegram pack follow.
 * skip  → out of Review and Matches (kept under Skipped with the reason; it calibrates scoring).
 * later → back in Review after LATER_DAYS.
 * Every decision can be undone; Undo only deletes a tracker row the swipe itself created and nobody touched since.
 */

export type Decision = 'apply' | 'skip' | 'later';
export const LATER_DAYS = 3;

export function cleanReason(reason: unknown): string | undefined {
  if (typeof reason !== 'string') return undefined;
  const r = reason.trim();
  return (SKIP_REASONS as readonly string[]).includes(r) ? r : undefined;
}

type MatchRow = Awaited<ReturnType<typeof loadMatch>>;
async function loadMatch(userId: string, matchId: string) {
  return getPrisma().jobMatch.findFirst({
    where: { id: matchId, userId },
    include: { job: { select: { id: true, title: true, company: true, url: true, location: true, remote: true, source: { select: { company: true } } } } },
  });
}

async function saveSwipe(match: NonNullable<MatchRow>, swipe: SwipeDecision | undefined, extra: Record<string, unknown> = {}) {
  const meta: AiMeta = { ...parseAiMeta(match.aiMeta) };
  if (swipe) meta.swipe = swipe;
  else delete meta.swipe;
  await getPrisma().jobMatch.update({ where: { id: match.id }, data: { aiMeta: meta as object, ...extra } });
}

/** The tracker row for this job: already linked, same posting link, or same company + role. */
async function findApplication(userId: string, jobId: string, url: string | null, company: string, role: string) {
  const prisma = getPrisma();
  const urlKey = normalizeUrl(url);
  const keys = [urlKey && !isGenericCareersUrl(urlKey) ? urlKey : null, companyRoleKey(company, role)].filter((k): k is string => Boolean(k));
  return prisma.application.findFirst({ where: { userId, OR: [{ jobId }, { dedupeKey: { in: keys } }] } });
}

export async function decide(userId: string, matchId: string, decision: Decision, reason?: string) {
  const prisma = getPrisma();
  const match = await loadMatch(userId, matchId);
  if (!match) return null;
  const now = new Date();
  const company = match.job.company || match.job.source.company;

  if (decision === 'apply') {
    let app = await findApplication(userId, match.job.id, match.job.url, company, match.job.title);
    const created = !app;
    if (!app) {
      const urlKey = normalizeUrl(match.job.url);
      app = await prisma.application.create({
        data: {
          userId,
          jobId: match.job.id,
          company,
          role: match.job.title,
          url: match.job.url || null,
          location: [match.job.location, match.job.remote ? 'Remote' : null].filter(Boolean).join(' · ') || null,
          source: 'jobber',
          status: 'to_apply',
          score: match.score,
          priority: match.score >= 80 ? 'high' : match.score >= 65 ? 'medium' : 'low',
          whyFit: match.reasons.join('\n') || null,
          risks: match.redFlags.join('\n') || null,
          nextAction: 'Send the application (letter is being prepared)',
          dedupeKey: urlKey && !isGenericCareersUrl(urlKey) ? urlKey : companyRoleKey(company, match.job.title),
        },
      });
    } else if (!app.jobId) {
      await prisma.application.update({ where: { id: app.id }, data: { jobId: match.job.id } });
    }
    await saveSwipe(match, { d: 'apply', at: now.toISOString(), appId: app.id, created });
    return { decision, applicationId: app.id, created };
  }

  if (decision === 'skip') {
    const prev = parseAiMeta(match.aiMeta).swipe;
    await saveSwipe(
      match,
      { d: 'skip', at: now.toISOString(), ...(reason ? { reason } : {}), prevFlags: prev?.d === 'skip' ? prev.prevFlags : match.redFlags },
      { filtered: true, redFlags: [USER_SKIP_FLAG] },
    );
    return { decision };
  }

  await saveSwipe(match, { d: 'later', at: now.toISOString(), until: new Date(now.getTime() + LATER_DAYS * 864e5).toISOString() });
  return { decision };
}

/** Sets or changes the reason of a skip (the chips show up right after the swipe). */
export async function setSkipReason(userId: string, matchId: string, reason: string | undefined) {
  const match = await loadMatch(userId, matchId);
  const swipe = match && parseAiMeta(match.aiMeta).swipe;
  if (!match || swipe?.d !== 'skip') return false;
  await saveSwipe(match, { ...swipe, ...(reason ? { reason } : { reason: undefined }) });
  return true;
}

/** Takes the last decision back. */
export async function undo(userId: string, matchId: string) {
  const prisma = getPrisma();
  const match = await loadMatch(userId, matchId);
  const swipe = match && parseAiMeta(match.aiMeta).swipe;
  if (!match || !swipe) return false;
  if (swipe.d === 'apply' && swipe.appId && swipe.created) {
    // Only a row this swipe made and that is still untouched (to_apply, no notes, not applied).
    await prisma.application.deleteMany({ where: { id: swipe.appId, userId, status: 'to_apply', appliedAt: null, notes: null } });
  }
  await saveSwipe(match, undefined, swipe.d === 'skip' ? { filtered: false, redFlags: swipe.prevFlags ?? [] } : {});
  return true;
}
