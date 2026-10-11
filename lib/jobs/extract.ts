import * as cheerio from 'cheerio';
import { stripHtml } from '@/lib/sources/html';

export interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  remote: boolean;
  postedAt?: Date;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
}

const clean = (s: unknown) => (typeof s === 'string' ? stripHtml(s).replace(/\u200b/g, '').trim() : '');

function walk(node: unknown, out: Record<string, unknown>[]) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, out));
  const o = node as Record<string, unknown>;
  const t = o['@type'];
  if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) out.push(o);
  if (o['@graph']) walk(o['@graph'], out);
}

function placeOf(loc: unknown): string {
  const list = Array.isArray(loc) ? loc : loc ? [loc] : [];
  return [
    ...new Set(
      list
        .map((l) => {
          const a = (l as { address?: Record<string, string> | string })?.address;
          if (typeof a === 'string') return a;
          return [a?.addressLocality, a?.addressCountry && typeof a.addressCountry === 'string' ? a.addressCountry : (a?.addressCountry as unknown as { name?: string })?.name]
            .filter(Boolean)
            .join(', ');
        })
        .filter(Boolean),
    ),
  ].join(' · ');
}

/** schema.org JobPosting from <script type="application/ld+json">. */
export function jobFromJsonLd(html: string): ExtractedJob | null {
  const $ = cheerio.load(html);
  const found: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, e) => {
    try {
      walk(JSON.parse($(e).text().trim()), found);
    } catch {
      /* broken JSON-LD */
    }
  });
  const p = found[0];
  if (!p) return null;
  const org = p.hiringOrganization as { name?: string } | string | undefined;
  const salary = (p.baseSalary as { currency?: string; value?: { minValue?: number; maxValue?: number; value?: number } }) || undefined;
  const title = clean(p.title);
  const description = clean(p.description);
  if (!title || description.length < 80) return null;
  return {
    title,
    company: clean(typeof org === 'string' ? org : org?.name),
    location: placeOf(p.jobLocation),
    description,
    remote: p.jobLocationType === 'TELECOMMUTE' || /remote|home.?office/i.test(title),
    postedAt: typeof p.datePosted === 'string' && !Number.isNaN(Date.parse(p.datePosted)) ? new Date(p.datePosted) : undefined,
    salaryMin: salary?.value?.minValue ?? salary?.value?.value,
    salaryMax: salary?.value?.maxValue,
    currency: salary?.currency,
  };
}

/** Readable text of the page body (scripts/nav/footers removed), incl. iframe srcdoc ads. */
export function pageText(html: string, preferred: string[] = []): string {
  const $ = cheerio.load(html);
  for (const sel of preferred) {
    const el = $(sel).first();
    const src = el.attr('srcdoc');
    const text = src ? pageText(src) : el.length ? (el.find('script,style').remove(), el.text()) : '';
    const t = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    if (t.length > 300) return t;
  }
  $('script,style,noscript,nav,header,footer,svg,form,iframe').remove();
  const root = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body');
  root.find('p,li,h1,h2,h3,h4,br,div').each((_, e) => {
    $(e).append('\n');
  });
  return root.text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/** Cheap guess without AI: og/h1 title + body text. Company/location usually missing. */
export function jobFromHeuristics(html: string): ExtractedJob | null {
  const $ = cheerio.load(html);
  const title = clean($('h1').first().text()) || clean($('meta[property="og:title"]').attr('content')) || clean($('title').text());
  const description = pageText(html).slice(0, 15000);
  if (!title || description.length < 200) return null;
  return {
    title: title.slice(0, 200),
    company: clean($('meta[property="og:site_name"]').attr('content')),
    location: '',
    description,
    remote: /remote|home.?office/i.test(description.slice(0, 3000)),
  };
}

/** Pages that are a login wall / bot check rather than the ad. */
export function looksBlocked(status: number, html: string) {
  if ([401, 403, 429, 999].includes(status)) return true;
  const head = html.slice(0, 30000).toLowerCase();
  return /cf-chl|captcha|just a moment\.\.\.|px-captcha|datadome|authwall|sign in to view|please log in|einloggen um/.test(head);
}
