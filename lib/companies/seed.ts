import seed from './seed.json';

export type SeedAts =
  | 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'personio' | 'recruitee' | 'smartrecruiters' | 'teamtailor' | 'bamboohr' | 'workday' | 'join';

export interface SeedCompany {
  name: string;
  ats: SeedAts;
  slug: string;
  industry: string;
  tags: string[];
  /** open jobs when verified (Workday: first page only) */
  jobs: number;
  countries: string[];
  cities: string[];
  remoteShare: number;
}

/** Companies whose public ATS board answered with open jobs when the list was built (scripts/verify-seed.mjs). */
export const SEED_COMPANIES = seed.companies as SeedCompany[];
export const SEED_VERIFIED_AT = seed.verifiedAt;

export function placeLabel(c: Pick<SeedCompany, 'cities' | 'countries' | 'remoteShare'>) {
  const where = c.cities.slice(0, 2).join(' / ') || c.countries.slice(0, 2).join(' / ');
  return [where, c.remoteShare >= 0.3 ? 'Remote' : null].filter(Boolean).join(' · ') || 'Various';
}

export function boardUrl(c: { ats: string; slug: string }): string {
  switch (c.ats) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`;
    case 'lever':
      return `https://api.lever.co/v0/postings/${c.slug}?mode=json`;
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${c.slug}?includeCompensation=true`;
    case 'workable':
      return `https://apply.workable.com/api/v1/widget/accounts/${c.slug}`;
    case 'personio':
      return `https://${c.slug}.jobs.personio.de/xml`;
    case 'recruitee':
      return `https://${c.slug}.recruitee.com/api/offers/`;
    case 'smartrecruiters':
      return `https://api.smartrecruiters.com/v1/companies/${c.slug}/postings?limit=100`;
    case 'teamtailor':
      return `https://${c.slug}.teamtailor.com/jobs.rss`;
    case 'bamboohr':
      return `https://${c.slug}.bamboohr.com/careers/list`;
    case 'join':
      return `https://join.com/companies/${c.slug}`;
    case 'workday': {
      const [tenant, wd, site] = c.slug.split(':');
      return `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
    }
    default:
      throw new Error(`Unknown ATS ${c.ats}`);
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, '');

const FIELD_INDUSTRIES: Record<string, string[]> = {
  'Software & IT': ['Software & AI', 'Finance', 'Travel', 'Media', 'Retail & e-commerce', 'Food & delivery', 'Education', 'HR & services', 'Healthcare'],
  Healthcare: ['Healthcare'],
  Hospitality: ['Travel', 'Food & delivery'],
  Logistics: ['Logistics', 'Food & delivery', 'Retail & e-commerce'],
  Engineering: ['Industry & manufacturing', 'Energy'],
  'Finance & accounting': ['Finance'],
  Education: ['Education'],
};

/**
 * Deterministic relevance: location fit first (user's city > country > remote),
 * then industry for the work field, then stack overlap.
 */
export function rankCompanies(
  input: { skills: string[]; city?: string | null; country?: string | null; location?: string | null; remote?: boolean; workField?: string | null },
  limit = 25,
) {
  const skills = new Set(input.skills.map(norm));
  const city = (input.city || input.location?.split(',')[0] || '').trim().toLowerCase();
  const country = (input.country || input.location?.split(',')[1] || '').trim().toLowerCase();
  const industries = input.workField ? FIELD_INDUSTRIES[input.workField] : undefined;
  return SEED_COMPANIES.map((c) => {
    let score = 0;
    if (city && c.cities.some((x) => x.toLowerCase() === city)) score += 12;
    if (country && c.countries.some((x) => x.toLowerCase() === country)) score += 6;
    if (c.countries.some((x) => /germany|switzerland|netherlands|ireland|united kingdom|france|spain|poland|czechia/i.test(x))) score += 1;
    score += c.remoteShare * (input.remote ? 6 : 2);
    if (industries) score += industries.includes(c.industry) ? 3 : -4;
    for (const t of c.tags) if (skills.has(norm(t))) score += 2;
    return { company: c, score };
  })
    .sort((a, b) => b.score - a.score || b.company.jobs - a.company.jobs)
    .slice(0, limit)
    .map((r) => r.company);
}
