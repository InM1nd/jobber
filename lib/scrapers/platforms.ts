import * as cheerio from 'cheerio';
import type { RawJob } from '@/lib/sources/types';
import { jobFromJsonLd, pageText } from '@/lib/jobs/extract';
import { politeGet, scrubPersonal, slug } from './polite';

/**
 * Owner-only scrapers for Austrian job platforms. Public, no-login search pages
 * only; each entry documents its robots.txt / blocking status (checked 2026-10-11).
 */

export interface Platform {
  id: string;
  name: string;
  status: 'enabled' | 'robots' | 'blocked';
  note: string;
  searchUrl?: (keyword: string, city: string) => string;
  parseList?: (html: string, base: string) => RawJob[];
  /** Fills the description from the job page (also a public page). */
  detail?: (html: string) => string;
}

const DETAILS_PER_RUN = Number(process.env.SCRAPER_DETAILS_PER_RUN || 6);
const textOf = ($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>) => {
  el.find('style,script').remove();
  return el.text().replace(/\s+/g, ' ').trim();
};
const daysAgo = (s: string) => {
  const t = s.toLowerCase();
  if (/heute|today|stunde|minute/.test(t)) return new Date();
  if (/gestern|yesterday/.test(t)) return new Date(Date.now() - 864e5);
  const m = t.match(/(\d+)\s*(tag|day|woche|week|monat|month)/);
  if (!m) return undefined;
  const n = Number(m[1]) * (/woche|week/.test(m[2]) ? 7 : /monat|month/.test(m[2]) ? 30 : 1);
  return new Date(Date.now() - n * 864e5);
};
const remoteish = (s: string) => /home[- ]?office|remote|homeoffice/i.test(s);

function mainText(html: string, selectors: string[]) {
  const ld = jobFromJsonLd(html);
  if (ld && ld.description.length > 300) return ld.description;
  return pageText(html, selectors);
}

export const PLATFORMS: Platform[] = [
  {
    id: 'karriere',
    name: 'karriere.at',
    status: 'enabled',
    note: 'robots.txt allows all paths for *; server-rendered list.',
    searchUrl: (k, c) => `https://www.karriere.at/jobs/${slug(k)}/${slug(c)}`,
    parseList(html) {
      const $ = cheerio.load(html);
      return $('.m-jobsListItem')
        .map((_, e) => {
          const x = $(e);
          const a = x.find('a.m-jobsListItem__titleLink, .m-jobsListItem__title a').first();
          const url = a.attr('href') || '';
          const id = url.match(/\/jobs\/(\d+)/)?.[1];
          if (!id) return null;
          const loc = x.find('.m-jobsListItem__location').map((_, l) => $(l).text().replace(/,\s*$/, '').trim()).get().join(', ');
          return {
            externalId: `karriere:${id}`,
            company: x.find('.m-jobsListItem__companyName').first().text().trim() || 'Unknown',
            title: a.text().trim(),
            location: loc,
            remote: remoteish(x.text()),
            description: '',
            url: url.startsWith('http') ? url : `https://www.karriere.at${url}`,
            postedAt: daysAgo(x.find('.m-jobsListItem__date').text()),
          } satisfies RawJob;
        })
        .get()
        .filter(Boolean) as RawJob[];
    },
    detail: (html) => mainText(html, ['iframe.m-jobContent__iFrame', '.m-jobContent__jobText', '.m-jobContent']),
  },
  {
    id: 'stepstone',
    name: 'StepStone.at',
    status: 'enabled',
    note: 'robots.txt disallows /jobs/*?* (query URLs) — we use the allowed path form /jobs/{keyword}/in-{city}.',
    searchUrl: (k, c) => `https://www.stepstone.at/jobs/${slug(k)}/in-${slug(c)}`,
    parseList(html) {
      const $ = cheerio.load(html);
      return $('article[data-at="job-item"], article[id^="job-item"]')
        .map((_, e) => {
          const x = $(e);
          const t = x.find('[data-at="job-item-title"]').first();
          const a = t.is('a') ? t : t.find('a').first().length ? t.find('a').first() : t.closest('a');
          const href = a.attr('href') || '';
          const id = (x.attr('id') || '').replace('job-item-', '') || href.match(/--(\d+)-inline/)?.[1];
          if (!href || !id) return null;
          return {
            externalId: `stepstone:${id}`,
            company: textOf($, x.find('[data-at="job-item-company-name"]').first()) || 'Unknown',
            title: textOf($, t),
            location: textOf($, x.find('[data-at="job-item-location"]').first()),
            remote: x.find('[data-at="job-item-work-from-home"]').length > 0,
            description: textOf($, x.find('[data-at="jobcard-content"], [data-at="job-item-middle"]').first()),
            url: (href.startsWith('http') ? href : `https://www.stepstone.at${href}`).split('?')[0],
            postedAt: daysAgo(textOf($, x.find('[data-at="job-item-timeago"]').first())),
          } satisfies RawJob;
        })
        .get()
        .filter(Boolean) as RawJob[];
    },
    detail: (html) => mainText(html, ['[data-at="job-ad-content"]', '[data-genesis-element="CARD"] article', 'main']),
  },
  {
    id: 'derstandard',
    name: 'derStandard Karriere',
    status: 'enabled',
    note: 'robots.txt for * only disallows /wp-admin/ and /jobsuche/c/job/; list data is embedded page state.',
    searchUrl: (k, c) => `https://jobs.derstandard.at/suche/${slug(c)}/${slug(k)}`,
    parseList(html) {
      const s = html.replace(/\\"/g, '"');
      const parts = s.split('"__typename":"JobListingResponse"').slice(1);
      const out: RawJob[] = [];
      for (const p of parts) {
        const id = p.match(/"id":"([0-9a-f-]{36})"/)?.[1];
        const title = p.match(/"title":"([^"]{2,200})","employmentTypes"/)?.[1] || p.match(/"title":"([^"]{2,200})"/)?.[1];
        if (!id || !title) continue;
        const org = p.match(/"hiringOrganization":\{[^}]*?"name":"([^"]+)"/)?.[1];
        const locs = p.match(/"jobLocationsRaw":\[([^\]]*)\]/)?.[1]?.match(/"([^"]+)"/g)?.map((x) => x.slice(1, -1)) || [];
        const tags = p.match(/"tags":\[([^\]]*)\]/)?.[1]?.match(/"([^"]+)"/g)?.map((x) => x.slice(1, -1)) || [];
        const date = p.match(/"displayDate":"([^"]+)"/)?.[1];
        out.push({
          externalId: `derstandard:${id}`,
          company: org || 'Unknown',
          title: JSON.parse(`"${title.replace(/\\u/g, '\\u')}"`),
          location: locs.filter((l) => !/home-office/i.test(l)).join(', '),
          remote: locs.some(remoteish),
          description: tags.join(' · '),
          url: `https://jobs.derstandard.at/detail/${id}`,
          postedAt: date ? new Date(date) : undefined,
        });
      }
      return [...new Map(out.map((j) => [j.externalId, j])).values()];
    },
    detail: (html) => mainText(html, ['[class*="JobDetail"]', 'article', 'main']),
  },
  { id: 'ams', name: 'AMS alle jobs / eJob-Room', status: 'robots', note: 'jobs.ams.at robots.txt disallows /public/emps/ for all bots except LinkedInBot; www.ams.at disallows /arbeitssuchende/suche. Search API also needs login.' },
  { id: 'willhaben', name: 'willhaben Jobs', status: 'robots', note: 'robots.txt disallows /jobs/suche?* and /jobs/webapi/ — no allowed search path.' },
  { id: 'indeed', name: 'Indeed AT', status: 'blocked', note: 'Search returns HTTP 403 with a captcha for non-browser clients.' },
];

const PERSONAL_SAFE = (j: RawJob): RawJob => ({ ...j, description: scrubPersonal(j.description) });

/** One list page + a few detail pages (for descriptions/language). */
export async function scrapePlatform(id: string, keyword: string, city: string, opts: { details?: number } = {}): Promise<RawJob[]> {
  const p = PLATFORMS.find((x) => x.id === id);
  if (!p || p.status !== 'enabled' || !p.searchUrl || !p.parseList) return [];
  const url = p.searchUrl(keyword, city);
  const jobs = p.parseList(await politeGet(p.id, url), url);
  const n = Math.min(opts.details ?? DETAILS_PER_RUN, jobs.length);
  for (const job of jobs.slice(0, n)) {
    if (!p.detail) break;
    try {
      const text = p.detail(await politeGet(p.id, job.url));
      if (text.length > job.description.length) job.description = text.slice(0, 15000);
    } catch (e) {
      if ((e as Error).message.includes('budget') || (e as Error).message.includes('blocked')) break;
    }
  }
  return jobs.map(PERSONAL_SAFE);
}
