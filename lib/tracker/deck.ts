import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';
import { demoStore } from '@/lib/demo/store';
import { parseAiMeta, type AiMeta } from '@/lib/ai/meta';
import { parseStoredRequirements, type RequirementItem } from '@/lib/search/requirements';
import { jobDigest } from '@/lib/search/digest';
import { dropTracked, notTracked } from './link';

/** Review: today's best undecided matches, one card each. */

export const DECK_SIZE = 15;
/** Below this a card isn't worth a decision (the user's own min score wins when higher). */
export const DECK_MIN = Number(process.env.DECK_MIN_SCORE || 50);

export interface DeckCard {
  id: string;
  score: number;
  reasons: string[];
  redFlags: string[];
  requirements: RequirementItem[];
  locationTier: string | null;
  agent: AiMeta['agent'] | null;
  verified: AiMeta['verified'] | null;
  job: {
    title: string;
    company: string;
    location: string | null;
    remote: boolean;
    url: string;
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string | null;
    postedAt: string | null;
    /** Requirements and tasks sections of the ad, not the company blurb. */
    digest: string;
  };
}

/** Still undecided, or "later" whose time has come. Pure. */
export function undecided(meta: AiMeta, now = Date.now()) {
  const s = meta.swipe;
  if (!s) return true;
  return s.d === 'later' && (!s.until || Date.parse(s.until) <= now);
}

export async function getDeck(userId: string, minScore = 0): Promise<DeckCard[]> {
  if (isDemoMode()) {
    return demoStore.matches().filter((m) => m.score >= Math.max(DECK_MIN, minScore) && undecided(m.aiMeta || {})).slice(0, DECK_SIZE).map((m) => ({
      id: m.id, score: m.score, reasons: m.reasons, redFlags: m.redFlags, requirements: m.requirements || [], locationTier: m.locationTier ?? null,
      agent: m.aiMeta?.agent ?? null, verified: m.aiMeta?.verified ?? null,
      job: { ...m.job, digest: jobDigest(m.job.description, 1800) },
    }));
  }
  const rows = await getPrisma().jobMatch.findMany({
    where: { userId, filtered: false, score: { gte: Math.max(DECK_MIN, minScore) }, ...notTracked(userId) },
    include: { job: { include: { source: { select: { company: true } } } } },
    orderBy: { score: 'desc' },
    take: 60,
  });
  const now = Date.now();
  const open = (await dropTracked(userId, rows)).filter((m) => undecided(parseAiMeta(m.aiMeta), now));
  return open.slice(0, DECK_SIZE).map((m) => {
    const meta = parseAiMeta(m.aiMeta);
    return {
      id: m.id,
      score: m.score,
      reasons: m.reasons,
      redFlags: m.redFlags,
      requirements: parseStoredRequirements(m.requirements) || [],
      locationTier: m.locationTier,
      agent: meta.agent ?? null,
      verified: meta.verified ?? null,
      job: {
        title: m.job.title,
        company: m.job.company || m.job.source.company,
        location: m.job.location,
        remote: m.job.remote,
        url: m.job.url,
        salaryMin: m.job.salaryMin,
        salaryMax: m.job.salaryMax,
        currency: m.job.currency,
        postedAt: m.job.postedAt?.toISOString() ?? null,
        digest: jobDigest(m.job.description, 1800),
      },
    };
  });
}
