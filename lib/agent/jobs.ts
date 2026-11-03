import { createHash } from 'node:crypto';
import { getPrisma } from '@/lib/db/prisma';
import { jobUrlKey, makeDedupeKey } from '@/lib/jobs/dedupe';
import { checkUrl, extractJob, fetchJobPage, NeedTextError } from '@/lib/jobs/add-by-link';
import type { ExtractedJob } from '@/lib/jobs/extract';
import { scrubPersonal } from '@/lib/scrapers/polite';
import { parseAiMeta, type AgentFind } from '@/lib/ai/meta';
import { QUEUED_FLAG } from '@/lib/search/score';
import { companyRoleKey, parseDate } from './api';

/**
 * Jobs found by an outside agent (Grok bot, Claude) enter the same pipeline as every other source:
 * stored once in Job (deduped by link, then company + title + place), queued for the owner's
 * pre-filter + AI scoring, shown in Matches. The tracker is only for decisions the owner makes.
 */

/** Below this the description is too thin to score: fetch the page or extract from text instead. */
export const MIN_DESCRIPTION = 150;

export interface AgentJobFields {
  url?: string;
  title?: string;
  company?: string;
  location?: string;
  remote: boolean;
  description?: string;
  /** Raw ad text to extract from (when title/company/description aren't given). */
  text?: string;
  postedAt?: Date;
  finder: string;
  note?: string;
  score?: number;
}

const str = (v: unknown, max: number) => (v == null || v === '' ? undefined : String(v).trim().slice(0, max) || undefined);

/** Validates one agent item. Pure. */
export function parseAgentJob(raw: unknown, defaultFinder = 'grok'): AgentJobFields | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'item must be an object' };
  const r = raw as Record<string, unknown>;
  const url = str(r.url, 1000);
  const text = str(r.text, 30_000);
  const description = str(r.description, 20_000);
  const title = str(r.title ?? r.role, 200);
  const company = str(r.company, 160);
  if (!url && !text && !(title && company && description)) return { error: 'send url, text, or title + company + description' };
  const scoreNum = r.score === undefined || r.score === null || r.score === '' ? NaN : Number(r.score);
  const posted = parseDate(r.postedAt);
  return {
    url,
    title,
    company,
    location: str(r.location, 160),
    remote: r.remote === true || r.remote === 'true',
    description,
    text,
    postedAt: posted ?? undefined,
    finder: (str(r.source ?? r.finder, 40) || defaultFinder).toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
    note: str(r.note ?? r.whyFit, 2000),
    score: Number.isFinite(scoreNum) ? Math.max(0, Math.min(100, Math.round(scoreNum))) : undefined,
  };
}

/** Whether the item already carries a usable ad (no page fetch, no AI extraction). */
export const isComplete = (f: AgentJobFields) => Boolean(f.title && f.company && (f.description?.length ?? 0) >= MIN_DESCRIPTION);

const label = (finder: string) => finder.charAt(0).toUpperCase() + finder.slice(1);

/** One shared source row per agent ("Found by Grok"). Never fetched by the cron. */
export async function agentSource(finder: string) {
  return getPrisma().jobSource.upsert({
    where: { company_sourceUrl: { company: `Found by ${label(finder)}`, sourceUrl: `agent:${finder}` } },
    create: { company: `Found by ${label(finder)}`, sourceUrl: `agent:${finder}`, sourceType: 'agent', sector: 'agent' },
    update: { isActive: true },
  });
}

async function findExisting(keys: { urlKey?: string | null; dedupeKey?: string | null }) {
  const or = [
    ...(keys.urlKey ? [{ urlKey: keys.urlKey }] : []),
    ...(keys.dedupeKey ? [{ dedupeKey: keys.dedupeKey }] : []),
  ];
  if (!or.length) return null;
  return getPrisma().job.findFirst({ where: { OR: or }, orderBy: { createdAt: 'asc' } });
}

export type AgentJobResult =
  | { jobId: string; matchId: string; status: 'created' | 'duplicate'; title: string; company: string; score: number | null; tracked: string | null;
      /** Already known: in the job pool before this call and/or in the tracker (by normalized link, then company + role). */
      duplicate: { pool: boolean; tracker: string | null } | null }
  | { error: string; retry?: boolean };

/**
 * Stores one agent find for the owner and queues it for scoring. A known posting is reused
 * (the agent's note is still attached). An existing score is kept; nothing is sent anywhere.
 */
export async function addAgentJob(ownerId: string, f: AgentJobFields): Promise<AgentJobResult> {
  const prisma = getPrisma();
  let url: URL | undefined;
  try {
    if (f.url) url = checkUrl(f.url);
  } catch (e) {
    if (!isComplete(f) && !f.text) return { error: e instanceof Error ? e.message : 'bad url' };
  }
  const urlKey = jobUrlKey(url?.toString(), 'agent');

  // Cheap check first: a link we already have needs no fetch and no AI.
  let job = urlKey ? await findExisting({ urlKey }) : null;
  let status: 'created' | 'duplicate' = 'duplicate';
  if (!job) {
    let ad: ExtractedJob;
    try {
      ad = isComplete(f)
        ? { title: f.title!, company: f.company!, location: f.location || '', remote: f.remote, description: f.description!, postedAt: f.postedAt }
        : f.text
          ? await extractJob(ownerId, { text: f.text })
          : await extractJob(ownerId, { html: await fetchJobPage(url!) });
    } catch (e) {
      if (e instanceof NeedTextError) return { error: `${e.message} Send title + company + description (or text) instead.` };
      throw e;
    }
    // The agent's own fields win over what extraction guessed.
    const title = f.title || ad.title;
    const company = f.company || ad.company || 'Unknown company';
    const location = f.location || ad.location || null;
    const dedupeKey = makeDedupeKey(company, title, location);
    job = await findExisting({ dedupeKey });
    if (!job) {
      const src = await agentSource(f.finder);
      const description = scrubPersonal(ad.description).slice(0, 20_000);
      const externalId = urlKey || `text:${createHash('sha1').update(`${company}|${title}|${description}`).digest('hex').slice(0, 16)}`;
      const data = {
        company, title, location,
        remote: f.remote || ad.remote,
        description,
        salaryMin: ad.salaryMin, salaryMax: ad.salaryMax, currency: ad.currency,
        postedAt: f.postedAt ?? ad.postedAt,
        url: url?.toString() || '',
        dedupeKey,
        urlKey,
        isActive: true,
      };
      job = await prisma.job.upsert({
        where: { sourceId_externalId: { sourceId: src.id, externalId } },
        create: { sourceId: src.id, externalId, ...data },
        update: data,
      });
      status = 'created';
    }
  }

  const find: AgentFind = { by: f.finder, at: new Date().toISOString(), ...(f.note ? { note: f.note } : {}), ...(f.score !== undefined ? { score: f.score } : {}) };
  const existing = await prisma.jobMatch.findUnique({ where: { userId_jobId: { userId: ownerId, jobId: job.id } } });
  const meta = { ...parseAiMeta(existing?.aiMeta), agent: find };
  let matchId: string;
  if (existing) {
    // Skipped by the rules or by a low pre-score earlier: the agent's pick puts it back in the queue.
    const requeue = existing.filtered && !existing.redFlags.includes(QUEUED_FLAG);
    await prisma.jobMatch.update({
      where: { id: existing.id },
      data: { aiMeta: meta as object, ...(requeue ? { redFlags: [QUEUED_FLAG] } : {}) },
    });
    matchId = existing.id;
  } else {
    const created = await prisma.jobMatch.create({
      data: { userId: ownerId, jobId: job.id, score: 0, reasons: [], redFlags: [QUEUED_FLAG], priority: 'low', filtered: true, aiMeta: meta as object },
    });
    matchId = created.id;
  }

  const company = job.company || f.company || '';
  const app = await prisma.application.findFirst({
    where: {
      userId: ownerId,
      OR: [{ jobId: job.id }, ...(job.url ? [{ url: job.url }] : []), ...(f.url && f.url !== job.url ? [{ url: f.url }] : []), { dedupeKey: { in: [urlKey, companyRoleKey(company, job.title)].filter((k): k is string => Boolean(k)) } }],
    },
    select: { status: true },
  });
  const scored = existing && !existing.filtered ? existing.score : null;
  return { jobId: job.id, matchId, status, title: job.title, company, score: scored, tracked: app?.status ?? null,
    duplicate: status === 'duplicate' || app ? { pool: status === 'duplicate', tracker: app?.status ?? null } : null };
}
