import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';
import { demoStore } from '@/lib/demo/store';
import { parseAiMeta, type AiMeta } from '@/lib/ai/meta';
import { parseStoredRequirements, type RequirementItem } from '@/lib/search/requirements';
import { readableJob, salaryFromText, type ReadableSection } from '@/lib/jobs/readable';
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
  /** The scorer's 2-3 line summary, when it wrote one. */
  gist: string[];
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
    /** The ad laid out for reading (lib/jobs/readable.ts). */
    sections: ReadableSection[];
  };
}

/** Still undecided, or "later" whose time has come. Pure. */
export function undecided(meta: AiMeta, now = Date.now()) {
  const s = meta.swipe;
  if (!s) return true;
  return s.d === 'later' && (!s.until || Date.parse(s.until) <= now);
}

/** Card fields from the ad: readable sections, and the salary written in the text when the source sent none. */
function adFields(job: { description: string; salaryMin: number | null; salaryMax: number | null; currency: string | null }) {
  const pay = job.salaryMin || job.salaryMax ? {} : salaryFromText(job.description);
  return {
    sections: readableJob(job.description),
    salaryMin: job.salaryMin ?? pay.min ?? null,
    salaryMax: job.salaryMax ?? pay.max ?? null,
    currency: job.currency ?? pay.currency ?? null,
  };
}

/** How many cards Review has right now (the nav badge). Same rules as getDeck, without loading the ads. */
export async function countDeck(userId: string, minScore = 0): Promise<number> {
  if (isDemoMode()) return demoStore.matches().filter((m) => m.score >= Math.max(DECK_MIN, minScore) && undecided(m.aiMeta || {})).length;
  const rows = await getPrisma().jobMatch.findMany({
    where: { userId, filtered: false, score: { gte: Math.max(DECK_MIN, minScore) }, ...notTracked(userId) },
    select: { aiMeta: true, job: { select: { url: true, title: true, company: true, source: { select: { company: true } } } } },
    orderBy: { score: 'desc' },
    take: 60,
  });
  const now = Date.now();
  return Math.min(DECK_SIZE, (await dropTracked(userId, rows)).filter((m) => undecided(parseAiMeta(m.aiMeta), now)).length);
}

export async function getDeck(userId: string, minScore = 0): Promise<DeckCard[]> {
  if (isDemoMode()) {
    return demoStore.matches().filter((m) => m.score >= Math.max(DECK_MIN, minScore) && undecided(m.aiMeta || {})).slice(0, DECK_SIZE).map((m) => ({
      id: m.id, score: m.score, reasons: m.reasons, redFlags: m.redFlags, requirements: m.requirements || [], locationTier: m.locationTier ?? null,
      agent: m.aiMeta?.agent ?? null, verified: m.aiMeta?.verified ?? null, gist: m.aiMeta?.gist ?? [],
      job: { title: m.job.title, company: m.job.company, location: m.job.location, remote: m.job.remote, url: m.job.url, postedAt: m.job.postedAt, ...adFields(m.job) },
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
      gist: meta.gist ?? [],
      job: {
        title: m.job.title,
        company: m.job.company || m.job.source.company,
        location: m.job.location,
        remote: m.job.remote,
        url: m.job.url,
        postedAt: m.job.postedAt?.toISOString() ?? null,
        ...adFields(m.job),
      },
    };
  });
}
