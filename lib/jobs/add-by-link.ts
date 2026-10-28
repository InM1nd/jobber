import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getPrisma } from '@/lib/db/prisma';
import { runAi } from '@/lib/ai/run';
import { parseJsonLoose } from '@/lib/ai/gemini';
import { makeDedupeKey } from './dedupe';
import { jobFromHeuristics, jobFromJsonLd, looksBlocked, pageText, type ExtractedJob } from './extract';
import { scrubPersonal, SCRAPER_UA } from '@/lib/scrapers/polite';
import { safeFetchText, UnsafeUrlError } from '@/lib/net/safe-fetch';

export class NeedTextError extends Error {}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd])/i;

export function checkUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new NeedTextError('That does not look like a link.');
  }
  if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname) || u.hostname.endsWith('.internal') || u.hostname.endsWith('.local'))
    throw new NeedTextError('This link cannot be opened.');
  return u;
}

/** One fetch of one page, only because the user asked for it. Every hop is checked (no private network). */
export async function fetchJobPage(url: URL): Promise<string> {
  let res: Awaited<ReturnType<typeof safeFetchText>>;
  try {
    res = await safeFetchText(url, {
      headers: { 'user-agent': SCRAPER_UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en,de;q=0.8' },
      timeoutMs: 15_000,
      maxBytes: 3_000_000,
    });
  } catch (error) {
    throw new NeedTextError(error instanceof UnsafeUrlError ? error.message : 'The site did not respond.');
  }
  const html = res.text;
  if (looksBlocked(res.status, html)) throw new NeedTextError('This site does not let us open the page (login or bot check).');
  if (!res.ok) throw new NeedTextError(`The site answered with an error (${res.status}).`);
  return html;
}

const AiJob = z.object({
  isJob: z.boolean().catch(true),
  title: z.string().catch(''),
  company: z.string().catch(''),
  location: z.string().catch(''),
  remote: z.boolean().catch(false),
  description: z.string().catch(''),
});

const SYSTEM = `You extract one job ad from messy page text. Reply JSON only:
{"isJob":bool,"title":str,"company":str,"location":"City, Country or empty","remote":bool,"description":"the ad's own text: tasks, requirements, offer, salary — cleaned, no navigation/cookie text, no names/emails/phones of people"}
Use only facts in the text. If it is not a job ad set isJob false.`;

export async function extractWithAi(userId: string, text: string): Promise<ExtractedJob> {
  const reply = await runAi(userId, 'parse', `Page text:\n"""\n${text.slice(0, 14_000)}\n"""`, {
    tier: 'lite', system: SYSTEM, json: true, temperature: 0, maxTokens: 4096, maxWaitMs: 25_000,
  });
  const j = AiJob.parse(parseJsonLoose(reply));
  if (!j.isJob || !j.title) throw new NeedTextError('Could not find a job ad there — paste the job text instead.');
  return { title: j.title.slice(0, 200), company: j.company.slice(0, 120), location: j.location.slice(0, 160), remote: j.remote, description: j.description || text };
}

/** JSON-LD first, then heuristics (+AI to fill gaps), then AI from raw text. */
export async function extractJob(userId: string, input: { html?: string; text?: string }): Promise<ExtractedJob> {
  if (input.html) {
    const ld = jobFromJsonLd(input.html);
    if (ld && ld.company) return ld;
    const guess = ld || jobFromHeuristics(input.html);
    const text = guess?.description || pageText(input.html);
    if (text.length < 150) throw new NeedTextError('The page had almost no text — paste the job text instead.');
    const ai = await extractWithAi(userId, `${guess?.title ? `Title: ${guess.title}\n` : ''}${text}`);
    return { ...ai, description: ld?.description || ai.description, postedAt: ld?.postedAt };
  }
  const text = (input.text || '').trim();
  if (text.length < 80) throw new NeedTextError('Please paste a bit more of the job text.');
  return extractWithAi(userId, text);
}

/** Per-user "manual" source that holds jobs the user added by hand. Never fetched. */
export async function manualSource(userId: string) {
  const prisma = getPrisma();
  const src = await prisma.jobSource.upsert({
    where: { company_sourceUrl: { company: 'Added by you', sourceUrl: `manual:${userId}` } },
    create: { company: 'Added by you', sourceUrl: `manual:${userId}`, sourceType: 'manual', sector: 'manual' },
    update: {},
  });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { sourceIds: true } });
  if (profile && !profile.sourceIds.includes(src.id))
    await prisma.profile.update({ where: { userId }, data: { sourceIds: [...profile.sourceIds, src.id] } });
  return src;
}

export async function saveManualJob(userId: string, job: ExtractedJob, url?: string) {
  const prisma = getPrisma();
  const src = await manualSource(userId);
  const description = scrubPersonal(job.description).slice(0, 20000);
  const externalId = url ? `url:${url}` : `text:${createHash('sha1').update(description).digest('hex').slice(0, 16)}`;
  const data = {
    company: job.company || 'Unknown company',
    title: job.title,
    location: job.location || null,
    remote: job.remote,
    description,
    salaryMin: job.salaryMin, salaryMax: job.salaryMax, currency: job.currency,
    postedAt: job.postedAt,
    url: url || '',
    dedupeKey: makeDedupeKey(job.company || '', job.title, job.location),
    isActive: true,
  };
  return prisma.job.upsert({
    where: { sourceId_externalId: { sourceId: src.id, externalId } },
    create: { sourceId: src.id, externalId, ...data },
    update: data,
  });
}
