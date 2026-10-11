import axios from 'axios';
import Parser from 'rss-parser';
import { JobSource, JobSourceConfig, RawJob } from './types';
import { looksRemote, stripHtml } from './html';

/**
 * More free, public job APIs / feeds (all used per their public terms; no scraping
 * of logged-in or anti-bot pages). Keyword + location live in the source URL
 * (fragment `#q=&l=` for feeds that have no server-side search).
 */

const UA = { 'user-agent': 'Jobber/1.0 (+https://jobber-kohl.vercel.app)' };
const rss = new Parser();

function frag(url: string) {
  const [base, f] = url.split('#');
  const p = new URLSearchParams(f || '');
  return { base, q: (p.get('q') || '').toLowerCase(), l: p.get('l') || '' };
}

/** Loose keyword match: every word of the keyword appears in the text. */
export function matchesKeyword(text: string, keyword: string) {
  if (!keyword) return true;
  const hay = text.toLowerCase();
  return keyword.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export function parseRemoteOk(data: unknown, q = ''): RawJob[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((j) => j && typeof j === 'object' && 'id' in j && 'position' in j)
    .map((j: any) => ({
      externalId: `remoteok:${j.id}`,
      company: String(j.company || 'Unknown'),
      title: String(j.position),
      location: j.location ? `Remote (${j.location})` : 'Remote',
      remote: true,
      description: stripHtml(String(j.description || '')),
      url: String(j.url || j.apply_url || ''),
      salaryMin: Number(j.salary_min) || undefined,
      salaryMax: Number(j.salary_max) || undefined,
      currency: Number(j.salary_min) ? 'USD' : undefined,
      postedAt: j.date ? new Date(j.date) : undefined,
      _t: `${j.position} ${(j.tags || []).join(' ')}`,
    }))
    .filter((j) => j.url && matchesKeyword(j._t, q))
    .map(({ _t, ...j }) => j);
}

export async function parseWwrRss(xml: string, q = ''): Promise<RawJob[]> {
  const feed = await rss.parseString(xml);
  return (feed.items || [])
    .map((item: any) => {
      const [company, ...rest] = String(item.title || '').split(': ');
      const title = rest.join(': ') || company;
      return {
        externalId: `wwr:${item.guid || item.link}`,
        company: rest.length ? company : 'Unknown',
        title,
        location: item.region ? `Remote (${item.region})` : 'Remote',
        remote: true,
        description: stripHtml(item.content || item.contentSnippet || ''),
        url: String(item.link || ''),
        postedAt: item.isoDate ? new Date(item.isoDate) : undefined,
      } satisfies RawJob;
    })
    .filter((j) => j.url && matchesKeyword(`${j.title} ${j.description.slice(0, 400)}`, q));
}

export function parseWorkingNomads(data: unknown, q = ''): RawJob[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((j: any) => ({
      externalId: `wn:${j.url}`,
      company: String(j.company_name || 'Unknown'),
      title: String(j.title || 'Untitled'),
      location: j.location ? `Remote (${j.location})` : 'Remote',
      remote: true,
      description: stripHtml(String(j.description || '')),
      url: String(j.url || ''),
      postedAt: j.pub_date ? new Date(j.pub_date) : undefined,
      _t: `${j.title} ${j.tags || ''} ${j.category_name || ''}`,
    }))
    .filter((j) => j.url && matchesKeyword(j._t, q))
    .map(({ _t, ...j }) => j);
}

export function parseMuse(data: unknown, q = ''): RawJob[] {
  const results = (data as { results?: unknown[] })?.results;
  if (!Array.isArray(results)) return [];
  return results
    .map((j: any) => {
      const locs: string[] = (j.locations || []).map((l: any) => String(l.name));
      return {
        externalId: `muse:${j.id}`,
        company: String(j.company?.name || 'Unknown'),
        title: String(j.name || 'Untitled').trim(),
        location: locs.join('; '),
        remote: locs.some((l) => /remote|flexible/i.test(l)),
        description: stripHtml(String(j.contents || '')),
        url: String(j.refs?.landing_page || ''),
        postedAt: j.publication_date ? new Date(j.publication_date) : undefined,
      } satisfies RawJob;
    })
    .filter((j) => j.url && matchesKeyword(j.title, q));
}

/** Bundesagentur für Arbeit Jobsuche API (official, public; documented at jobsuche.api.bund.dev). */
export function parseBundesagentur(data: unknown): RawJob[] {
  const list = (data as { ergebnisliste?: unknown[] })?.ergebnisliste;
  if (!Array.isArray(list)) return [];
  return list
    .map((j: any) => {
      const a = j.stellenlokationen?.[0]?.adresse || {};
      const where = [a.ort, a.land === 'DEUTSCHLAND' ? 'Germany' : a.land].filter(Boolean).join(', ');
      const title = String(j.stellenangebotsTitel || j.hauptberuf || 'Untitled');
      return {
        externalId: `ba:${j.referenznummer}`,
        company: String(j.firma || 'Unknown'),
        title,
        location: where,
        remote: looksRemote(title),
        description: [title, j.hauptberuf, ...(j.alleBerufe || []), j.arbeitszeitVollzeit ? 'Vollzeit' : 'Teilzeit möglich']
          .filter(Boolean)
          .join(' · '),
        url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(j.referenznummer)}`,
        postedAt: j.datumErsteVeroeffentlichung ? new Date(j.datumErsteVeroeffentlichung) : undefined,
      } satisfies RawJob;
    })
    .filter((j) => !j.externalId.endsWith('undefined'));
}

export function parseAdzuna(data: unknown): RawJob[] {
  const results = (data as { results?: unknown[] })?.results;
  if (!Array.isArray(results)) return [];
  return results.map((j: any) => ({
    externalId: `adzuna:${j.id}`,
    company: String(j.company?.display_name || 'Unknown'),
    title: stripHtml(String(j.title || 'Untitled')),
    location: String(j.location?.display_name || ''),
    remote: looksRemote(j.title) || looksRemote(j.description),
    description: stripHtml(String(j.description || '')),
    url: String(j.redirect_url || ''),
    salaryMin: Number(j.salary_min) || undefined,
    salaryMax: Number(j.salary_max) || undefined,
    postedAt: j.created ? new Date(j.created) : undefined,
  }));
}

export function parseJooble(data: unknown): RawJob[] {
  const jobs = (data as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.map((j: any) => ({
    externalId: `jooble:${j.id}`,
    company: String(j.company || 'Unknown'),
    title: stripHtml(String(j.title || 'Untitled')),
    location: String(j.location || ''),
    remote: looksRemote(j.title) || looksRemote(j.location),
    description: stripHtml(String(j.snippet || '')),
    url: String(j.link || ''),
    postedAt: j.updated ? new Date(j.updated) : undefined,
  }));
}

export function parseBamboo(data: unknown, slug: string): RawJob[] {
  const list = (data as { result?: unknown[] })?.result;
  if (!Array.isArray(list)) return [];
  return list.map((j: any) => {
    const loc = [j.location?.city, j.location?.state].filter(Boolean).join(', ');
    return {
      externalId: `bamboo:${slug}:${j.id}`,
      title: String(j.jobOpeningName || 'Untitled'),
      location: loc || (j.isRemote ? 'Remote' : undefined),
      remote: Boolean(j.isRemote) || looksRemote(loc),
      description: [j.departmentLabel, j.employmentStatusLabel].filter(Boolean).join(' · '),
      url: `https://${slug}.bamboohr.com/careers/${j.id}`,
    } satisfies RawJob;
  });
}

export function parseWorkday(data: unknown, careersBase: string): RawJob[] {
  const list = (data as { jobPostings?: unknown[] })?.jobPostings;
  if (!Array.isArray(list)) return [];
  return list
    .filter((j: any) => j.externalPath)
    .map((j: any) => ({
      externalId: `wd:${j.externalPath}`,
      title: String(j.title || 'Untitled'),
      location: String(j.locationsText || ''),
      remote: looksRemote(j.locationsText) || looksRemote(j.remoteType),
      description: [j.title, ...(j.bulletFields || [])].filter(Boolean).join(' · '),
      url: `${careersBase}${j.externalPath}`,
    }));
}

export class MoreSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const { sourceType: type, sourceUrl } = this.config;
    const { base, q, l } = frag(sourceUrl);
    switch (type) {
      case 'remoteok':
        return parseRemoteOk((await axios.get(base, { timeout: 20000, headers: { 'user-agent': 'Mozilla/5.0 Jobber/1.0' } })).data, q);
      case 'weworkremotely':
        return parseWwrRss(String((await axios.get(base, { timeout: 20000, headers: UA, responseType: 'text' })).data), q);
      case 'workingnomads':
        return parseWorkingNomads((await axios.get(base, { timeout: 20000, headers: UA })).data, q);
      case 'themuse': {
        const out: RawJob[] = [];
        for (let page = 0; page < 3; page++) {
          const res = await axios.get(base.replace(/page=\d+/, `page=${page}`), { timeout: 20000, headers: UA });
          out.push(...parseMuse(res.data, q));
        }
        return out;
      }
      case 'bundesagentur':
        return parseBundesagentur(
          (await axios.get(base, { timeout: 20000, headers: { ...UA, 'X-API-Key': 'jobboerse-jobsuche' } })).data,
        );
      case 'adzuna': {
        const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
        if (!id || !key) return [];
        const url = `${base}${base.includes('?') ? '&' : '?'}app_id=${id}&app_key=${key}`;
        return parseAdzuna((await axios.get(url, { timeout: 20000, headers: UA })).data);
      }
      case 'jooble': {
        const key = process.env.JOOBLE_API_KEY;
        if (!key) return [];
        return parseJooble((await axios.post(`https://jooble.org/api/${key}`, { keywords: q, location: l }, { timeout: 20000 })).data);
      }
      case 'bamboohr': {
        const slug = new URL(base).hostname.split('.')[0];
        return parseBamboo((await axios.get(base, { timeout: 20000, headers: UA })).data, slug);
      }
      case 'workday': {
        const u = new URL(base);
        const [, , , tenant, site] = u.pathname.split('/'); // /wday/cxs/{tenant}/{site}/jobs
        const careersBase = `${u.origin}/${site}`;
        const out: RawJob[] = [];
        for (let offset = 0; offset < 100; offset += 20) {
          const res = await axios.post(base, { limit: 20, offset, searchText: q, appliedFacets: {} }, { timeout: 20000, headers: UA });
          const page = parseWorkday(res.data, careersBase);
          out.push(...page);
          if (page.length < 20) break;
        }
        void tenant;
        return out;
      }
    }
    return [];
  }
}
