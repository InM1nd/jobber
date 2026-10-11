import axios from 'axios';
import { JobSource, JobSourceConfig, RawJob } from './types';
import { stripHtml } from './html';

/**
 * Keyword job boards that need no company watchlist. All public, no key.
 * The search keyword lives in the source URL so each (board, keyword) is one JobSource.
 */

export const KEYWORD_BOARDS = [
  'remotive', 'jobicy', 'himalayas', 'arbeitnow', 'remoteok', 'weworkremotely', 'workingnomads', 'themuse', 'bundesagentur', 'adzuna', 'jooble',
] as const;
export type KeywordBoard = (typeof KEYWORD_BOARDS)[number];

/** Remote-only boards are skipped when the user isn't open to remote. */
export const REMOTE_BOARDS: KeywordBoard[] = ['remotive', 'jobicy', 'himalayas', 'remoteok', 'weworkremotely', 'workingnomads'];
/** Boards with real local (city/country) search. */
export const LOCAL_BOARDS: KeywordBoard[] = ['bundesagentur', 'adzuna', 'jooble', 'arbeitnow', 'themuse'];

const ADZUNA_CC: Record<string, string> = {
  austria: 'at', germany: 'de', 'united kingdom': 'gb', netherlands: 'nl', france: 'fr', poland: 'pl', spain: 'es', italy: 'it', switzerland: 'ch', belgium: 'be',
};

/** Which keyword boards make sense for this user (location + keys configured). */
export function boardsFor(opts: { country?: string | null; remote: boolean }) {
  const c = (opts.country || '').toLowerCase();
  const list: KeywordBoard[] = [];
  if (c === 'germany') list.push('bundesagentur');
  if (process.env.ADZUNA_APP_ID && ADZUNA_CC[c]) list.push('adzuna');
  if (process.env.JOOBLE_API_KEY) list.push('jooble');
  if (!c || ['germany', 'austria', 'switzerland'].includes(c)) list.push('arbeitnow');
  if (c === 'united states' || c === 'united kingdom' || !c) list.push('themuse');
  if (opts.remote) list.push(...REMOTE_BOARDS);
  return list;
}

export function keywordSourceUrl(board: KeywordBoard, keyword: string, place: { city?: string | null; country?: string | null } = {}) {
  const q = encodeURIComponent(keyword.trim().toLowerCase());
  const city = encodeURIComponent(place.city || '');
  switch (board) {
    case 'remoteok':
      return `https://remoteok.com/api#q=${q}`;
    case 'weworkremotely':
      return `https://weworkremotely.com/remote-jobs.rss#q=${q}`;
    case 'workingnomads':
      return `https://www.workingnomads.com/api/exposed_jobs/#q=${q}`;
    case 'themuse':
      return `https://www.themuse.com/api/public/jobs?page=0${place.city ? `&location=${encodeURIComponent(`${place.city}, ${place.country || ''}`.trim())}` : ''}#q=${q}`;
    case 'bundesagentur':
      return `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs?was=${q}${city ? `&wo=${city}&umkreis=50` : ''}&size=50&veroeffentlichtseit=30`;
    case 'adzuna':
      return `https://api.adzuna.com/v1/api/jobs/${ADZUNA_CC[(place.country || '').toLowerCase()] || 'at'}/search/1?what=${q}${city ? `&where=${city}` : ''}&results_per_page=50&max_days_old=30`;
    case 'jooble':
      return `https://jooble.org/api/#q=${q}&l=${city}`;
    case 'remotive':
      return `https://remotive.com/api/remote-jobs?search=${q}&limit=50`;
    case 'jobicy':
      return `https://jobicy.com/api/v2/remote-jobs?count=50&tag=${q}`;
    case 'himalayas':
      return `https://himalayas.app/jobs/api/search?q=${q}&limit=40`;
    case 'arbeitnow':
      // No server-side search: we filter the newest pages by keyword (see #q=).
      return `https://www.arbeitnow.com/api/job-board-api#q=${q}`;
  }
}

const UA = { 'user-agent': 'Jobber/1.0 (+https://jobber-kohl.vercel.app)' };

export function parseJobicyJobs(data: unknown): RawJob[] {
  const jobs = (data as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.map((entry) => {
    const j = entry as Record<string, any>;
    const company = String(j.companyName || 'Unknown');
    return {
      externalId: `jobicy:${j.id}`,
      company,
      title: String(j.jobTitle || 'Untitled'),
      location: j.jobGeo ? `Remote (${String(j.jobGeo)})` : 'Remote',
      remote: true,
      description: stripHtml(String(j.jobDescription || j.jobExcerpt || '')),
      url: String(j.url || ''),
      salaryMin: Number(j.salaryMin) || undefined,
      salaryMax: Number(j.salaryMax) || undefined,
      currency: j.salaryCurrency ? String(j.salaryCurrency) : undefined,
      postedAt: j.pubDate ? new Date(j.pubDate) : undefined,
    };
  }).filter((j) => j.url);
}

export function parseHimalayasJobs(data: unknown): RawJob[] {
  const jobs = (data as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.map((entry) => {
    const j = entry as Record<string, any>;
    const restrictions: string[] = Array.isArray(j.locationRestrictions) ? j.locationRestrictions.map(String) : [];
    return {
      externalId: `himalayas:${j.guid || j.applicationLink}`,
      company: String(j.companyName || 'Unknown'),
      title: String(j.title || 'Untitled'),
      location: restrictions.length ? `Remote (${restrictions.slice(0, 4).join(', ')})` : 'Remote',
      remote: true,
      description: stripHtml(String(j.description || j.excerpt || '')),
      url: String(j.applicationLink || j.guid || ''),
      salaryMin: Number(j.minSalary) || undefined,
      salaryMax: Number(j.maxSalary) || undefined,
      currency: j.currency ? String(j.currency) : undefined,
      postedAt: j.pubDate ? new Date(Number(j.pubDate) * 1000) : undefined,
    };
  }).filter((j) => j.url);
}

export function parseArbeitnowJobs(data: unknown, keyword?: string): RawJob[] {
  const jobs = (data as { data?: unknown[] })?.data;
  if (!Array.isArray(jobs)) return [];
  const kw = (keyword || '').toLowerCase().replace(/[-\s]+/g, '');
  return jobs
    .map((entry) => {
      const j = entry as Record<string, any>;
      return {
        externalId: `arbeitnow:${j.slug}`,
        company: String(j.company_name || 'Unknown'),
        title: String(j.title || 'Untitled'),
        location: j.location ? String(j.location) : undefined,
        remote: Boolean(j.remote),
        description: stripHtml(String(j.description || '')),
        url: String(j.url || ''),
        postedAt: j.created_at ? new Date(Number(j.created_at) * 1000) : undefined,
        _tags: Array.isArray(j.tags) ? j.tags.join(' ') : '',
      };
    })
    .filter((j) => j.url && (!kw || `${j.title} ${j._tags}`.toLowerCase().replace(/[-\s]+/g, '').includes(kw)))
    .map(({ _tags, ...job }) => job);
}

export class KeywordBoardSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const type = this.config.sourceType as KeywordBoard;
    if (type === 'arbeitnow') {
      const [base, frag] = this.config.sourceUrl.split('#');
      const q = new URLSearchParams(frag || '').get('q') || '';
      const out: RawJob[] = [];
      for (let page = 1; page <= 3; page++) {
        const res = await axios.get(`${base}?page=${page}`, { timeout: 15000, headers: UA });
        out.push(...parseArbeitnowJobs(res.data, q));
      }
      return out;
    }
    const res = await axios.get(this.config.sourceUrl, { timeout: 20000, headers: UA });
    return type === 'jobicy' ? parseJobicyJobs(res.data) : parseHimalayasJobs(res.data);
  }
}
