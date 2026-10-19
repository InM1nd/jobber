import { boardUrl, SEED_COMPANIES, type SeedAts } from './seed';
import { createJobSource } from '@/lib/sources/factory';

/** Recognises a careers-page URL (or a page linking to one) as a public ATS board. */

const PATTERNS: Array<[SeedAts, RegExp]> = [
  ['greenhouse', /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([\w-]+)/i],
  ['greenhouse', /boards-api\.greenhouse\.io\/v1\/boards\/([\w-]+)/i],
  ['lever', /jobs\.(?:eu\.)?lever\.co\/([\w-]+)/i],
  ['ashby', /jobs\.ashbyhq\.com\/([\w.-]+)/i],
  ['workable', /apply\.workable\.com\/([\w-]+)/i],
  ['workable', /([\w-]+)\.workable\.com/i],
  ['personio', /([\w-]+)\.jobs\.personio\.(?:de|com)/i],
  ['recruitee', /([\w-]+)\.recruitee\.com/i],
  ['smartrecruiters', /(?:careers|jobs)\.smartrecruiters\.com\/([\w-]+)/i],
  ['teamtailor', /([\w-]+)\.teamtailor\.com/i],
  ['bamboohr', /([\w-]+)\.bamboohr\.com/i],
  ['join', /join\.com\/companies\/([\w-]+)/i],
];
const WORKDAY = /([\w-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([\w-]+)/i;

export function detectAtsFromUrl(text: string): { ats: SeedAts; slug: string } | null {
  const wd = text.match(WORKDAY);
  if (wd && !/^wday$/i.test(wd[3])) return { ats: 'workday', slug: `${wd[1]}:${wd[2]}:${wd[3]}` };
  for (const [ats, re] of PATTERNS) {
    const m = text.match(re);
    if (m && !/^(www|api|app|jobs|careers|embed)$/i.test(m[1])) return { ats, slug: m[1] };
  }
  return null;
}

const slugify = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '');

async function countJobs(ats: string, slug: string) {
  try {
    const jobs = await createJobSource({ company: slug, sourceType: ats, sourceUrl: boardUrl({ ats, slug }) }).fetch();
    return jobs.length;
  } catch {
    return 0;
  }
}

export interface DetectedCompany {
  name: string;
  ats: SeedAts;
  slug: string;
  jobs: number;
  how: 'dataset' | 'url' | 'page' | 'guess';
}

/**
 * Input: a company name or any careers URL. Tries, in order: our verified list,
 * a known ATS URL, ATS links inside the careers page, then common slugs by name.
 */
export async function detectCompany(input: string): Promise<DetectedCompany | null> {
  const raw = input.trim();
  if (!raw) return null;
  const isUrl = /^https?:\/\/|\.\w{2,}\//i.test(raw) || /^[\w-]+\.[a-z]{2,}$/i.test(raw);
  const known = SEED_COMPANIES.find((c) => c.name.toLowerCase() === raw.toLowerCase());
  if (known) return { name: known.name, ats: known.ats, slug: known.slug, jobs: known.jobs, how: 'dataset' };

  if (isUrl) {
    const url = /^https?:/i.test(raw) ? raw : `https://${raw}`;
    const direct = detectAtsFromUrl(url);
    const nameFromUrl = (s: string) => s.split(':')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (direct) {
      const jobs = await countJobs(direct.ats, direct.slug);
      if (jobs > 0) return { name: nameFromUrl(direct.slug), ...direct, jobs, how: 'url' };
    }
    // Look inside the careers page for an ATS link / embed.
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 Jobber/1.0' }, signal: AbortSignal.timeout(10_000), redirect: 'follow' });
      const html = (await res.text()).slice(0, 600_000);
      const found = detectAtsFromUrl(res.url) || detectAtsFromUrl(html);
      if (found) {
        const jobs = await countJobs(found.ats, found.slug);
        const title = html.match(/<meta[^>]+og:site_name[^>]+content="([^"]+)"/i)?.[1] || html.match(/<title>([^<|–-]+)/i)?.[1]?.trim();
        if (jobs > 0) return { name: title?.slice(0, 60) || nameFromUrl(found.slug), ...found, jobs, how: 'page' };
      }
    } catch {
      /* unreachable page */
    }
    return null;
  }

  const base = slugify(raw);
  const dashed = raw.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  const tries: Array<[SeedAts, string]> = [];
  for (const s of [...new Set([base, dashed])]) {
    tries.push(['greenhouse', s], ['lever', s], ['ashby', s], ['workable', s], ['personio', s], ['recruitee', s], ['teamtailor', s], ['smartrecruiters', raw.replace(/\s+/g, '')]);
  }
  const results = await Promise.all(tries.map(async ([ats, slug]) => ({ ats, slug, jobs: await countJobs(ats, slug) })));
  const best = results.filter((r) => r.jobs > 0).sort((a, b) => b.jobs - a.jobs)[0];
  return best ? { name: raw, ...best, how: 'guess' } : null;
}
