import { z } from 'zod';
import { getPrisma } from '@/lib/db/prisma';
import { decryptApiKey, encryptApiKey } from '@/lib/crypto/encryption';
import type { JobSource, JobSourceConfig, RawJob } from './types';

/**
 * JSearch: Google for Jobs as an API (LinkedIn, Indeed, Glassdoor, StepStone, karriere.at and
 * company sites, as Google indexes them), through OpenWeb Ninja or RapidAPI. Free plans give
 * ~200 requests a month, so each user brings their own key (the owner may use JSEARCH_API_KEY),
 * one source row per user and keyword, one request per fetch, fetched at most once a day, and a
 * monthly cap. Idea from AienTech/dossier (job-search/jsearch), written for Jobber.
 */

export type JSearchHost = 'openwebninja' | 'rapidapi';

const HOSTS: Record<JSearchHost, { base: string; headers: (key: string) => Record<string, string> }> = {
  openwebninja: { base: 'https://api.openwebninja.com/jsearch', headers: (key) => ({ 'x-api-key': key }) },
  rapidapi: { base: 'https://jsearch.p.rapidapi.com', headers: (key) => ({ 'x-rapidapi-key': key, 'x-rapidapi-host': 'jsearch.p.rapidapi.com' }) },
};

/** Requests per user per calendar month (UTC); stay under the free 200. */
export const MONTHLY_LIMIT = () => Number(process.env.JSEARCH_MONTHLY_LIMIT || 180);
/** A JSearch source is fetched at most this often. */
export const JSEARCH_FRESH_MS = 20 * 60 * 60 * 1000;

const COUNTRY: Record<string, string> = {
  austria: 'at', germany: 'de', switzerland: 'ch', 'united kingdom': 'gb', netherlands: 'nl', france: 'fr', spain: 'es', italy: 'it', poland: 'pl', ireland: 'ie', belgium: 'be', 'united states': 'us', ukraine: 'ua', portugal: 'pt', sweden: 'se', denmark: 'dk',
};

export class JSearchError extends Error {}

// Every field may be missing or null; one odd field doesn't drop the posting.
const text = z.string().nullish().catch(null);
const num = z.number().nullish().catch(null);
const flag = z.boolean().nullish().catch(null);
const jobSchema = z.object({
  job_id: z.string().min(1),
  job_title: text,
  employer_name: text,
  job_publisher: text,
  job_apply_link: text,
  job_apply_is_direct: flag,
  apply_options: z.array(z.object({ publisher: text, apply_link: text, is_direct: flag })).nullish().catch(null),
  job_description: text,
  job_is_remote: flag,
  job_city: text,
  job_state: text,
  job_country: text,
  job_location: text,
  job_posted_at_datetime_utc: text,
  job_min_salary: num,
  job_max_salary: num,
  job_salary_currency: text,
  job_salary_period: text,
});

/** The employer's own apply link when there is one, else the board's. */
export function applyLink(job: z.infer<typeof jobSchema>): string {
  const direct = job.apply_options?.find((o) => o.is_direct && o.apply_link)?.apply_link;
  return direct || job.job_apply_link || job.apply_options?.find((o) => o.apply_link)?.apply_link || '';
}

import { viaLine } from './via';
export { viaLine, viaOf } from './via';

export function parseJSearch(data: unknown): RawJob[] {
  const list = (data as { data?: unknown })?.data;
  const rows = Array.isArray(list) ? list : Array.isArray((list as { jobs?: unknown })?.jobs) ? (list as { jobs: unknown[] }).jobs : [];
  const out: RawJob[] = [];
  for (const raw of rows) {
    const parsed = jobSchema.safeParse(raw);
    if (!parsed.success) continue;
    const j = parsed.data;
    const url = applyLink(j);
    if (!url || !j.job_title) continue;
    const place = j.job_location || [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ');
    const yearly = !j.job_salary_period || /year/i.test(j.job_salary_period);
    const via = j.job_publisher?.trim();
    out.push({
      externalId: `jsearch:${j.job_id}`,
      company: j.employer_name || undefined,
      title: j.job_title,
      location: place || (j.job_is_remote ? 'Remote' : undefined),
      remote: Boolean(j.job_is_remote),
      description: `${(j.job_description || '').trim().slice(0, 18_000)}${via ? `\n\n${viaLine(via)}` : ''}`,
      salaryMin: yearly && j.job_min_salary ? Math.round(j.job_min_salary) : undefined,
      salaryMax: yearly && j.job_max_salary ? Math.round(j.job_max_salary) : undefined,
      currency: j.job_salary_currency || undefined,
      postedAt: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc) : undefined,
      url,
    });
  }
  return out;
}

/** The source URL for a user and keyword. The user id in the fragment picks whose key pays. */
export function jsearchSourceUrl(userId: string, keyword: string, place: { city?: string | null; country?: string | null; remote?: boolean }) {
  const where = [place.city, place.country].filter(Boolean).join(', ');
  const query = `${keyword.trim().toLowerCase()}${where ? ` in ${where}` : ''}`;
  const country = COUNTRY[(place.country || '').toLowerCase()] || '';
  const u = new URL('https://jsearch.local/search-v2');
  u.searchParams.set('query', query);
  if (country) u.searchParams.set('country', country);
  u.searchParams.set('date_posted', 'week');
  if (place.remote === false) u.searchParams.set('work_from_home', 'false');
  return `${u.toString()}#user=${userId}`;
}

// --- keys --------------------------------------------------------------------

/** Stored encrypted as "host:key" in ApiKey (provider "jsearch"). */
export async function saveJSearchKey(userId: string, host: JSearchHost, key: string) {
  const prisma = getPrisma();
  await prisma.apiKey.updateMany({ where: { userId, provider: 'jsearch' }, data: { isActive: false } });
  await prisma.apiKey.create({ data: { userId, provider: 'jsearch', ...encryptApiKey(`${host}:${key}`), isActive: true } });
}

export async function deleteJSearchKey(userId: string) {
  await getPrisma().apiKey.updateMany({ where: { userId, provider: 'jsearch' }, data: { isActive: false } });
}

/** The user's key, or the owner's env key; null when JSearch isn't set up for them. */
export async function jsearchKeyFor(userId: string): Promise<{ host: JSearchHost; key: string; own: boolean } | null> {
  const prisma = getPrisma();
  const row = await prisma.apiKey.findFirst({ where: { userId, provider: 'jsearch', isActive: true }, orderBy: { createdAt: 'desc' } });
  if (row) {
    try {
      const plain = decryptApiKey(row.encryptedKey, row.iv, row.authTag);
      const [host, ...rest] = plain.split(':');
      if ((host === 'openwebninja' || host === 'rapidapi') && rest.length) return { host, key: rest.join(':'), own: true };
    } catch {
      /* broken row: fall through */
    }
  }
  const envKey = process.env.JSEARCH_API_KEY?.trim();
  const owner = process.env.OWNER_TELEGRAM_ID?.trim();
  if (envKey && owner) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
    if (u?.telegramId === owner) return { host: process.env.JSEARCH_HOST === 'rapidapi' ? 'rapidapi' : 'openwebninja', key: envKey, own: false };
  }
  return null;
}

export async function jsearchKeyInfo(userId: string) {
  const row = await getPrisma().apiKey.findFirst({ where: { userId, provider: 'jsearch', isActive: true }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  return row ? { addedAt: row.createdAt.toISOString() } : null;
}

// --- monthly usage -----------------------------------------------------------

const month = (d = new Date()) => d.toISOString().slice(0, 7);

/** "2026-10:37" → 37 for this month, 0 for an older month. */
export function usedThisMonth(status: string | null | undefined, now = new Date()): number {
  const [m, n] = (status || '').split(':');
  return m === month(now) ? Number(n) || 0 : 0;
}

export async function jsearchUsage(userId: string) {
  const row = await getPrisma().cronJob.findUnique({ where: { name: `jsearch:${userId}` } });
  return { used: usedThisMonth(row?.lastStatus), limit: MONTHLY_LIMIT() };
}

/** Takes one request from this month's allowance, or throws when it's used up. */
async function takeRequest(userId: string) {
  const prisma = getPrisma();
  const name = `jsearch:${userId}`;
  const row = await prisma.cronJob.findUnique({ where: { name } });
  const used = usedThisMonth(row?.lastStatus);
  if (used >= MONTHLY_LIMIT()) throw new JSearchError(`JSearch monthly limit reached (${used}/${MONTHLY_LIMIT()}).`);
  const lastStatus = `${month()}:${used + 1}`;
  await prisma.cronJob.upsert({ where: { name }, create: { name, lastStatus, lastRunAt: new Date() }, update: { lastStatus, lastRunAt: new Date() } });
}

export class JSearchSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const [url, frag] = this.config.sourceUrl.split('#');
    const userId = new URLSearchParams(frag || '').get('user');
    if (!userId) throw new JSearchError('JSearch source without a user');
    const creds = await jsearchKeyFor(userId);
    if (!creds) throw new JSearchError('No JSearch key: add one in Settings.');
    await takeRequest(userId);
    const host = HOSTS[creds.host];
    const target = new URL(`${host.base}/search-v2`);
    new URL(url).searchParams.forEach((v, k) => target.searchParams.set(k, v));
    const res = await fetch(target, { headers: { ...host.headers(creds.key), accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 401 || res.status === 403) throw new JSearchError('JSearch refused the key (check it in Settings).');
    if (res.status === 429) throw new JSearchError('JSearch plan limit reached for now.');
    if (!res.ok) throw new JSearchError(`JSearch answered ${res.status}.`);
    return parseJSearch(await res.json());
  }
}
