import seed from './seed.json';

export interface SeedCompany {
  name: string;
  ats: 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'personio' | 'recruitee' | 'smartrecruiters';
  slug: string;
  hq: string;
  tags: string[];
  jobs: number;
}

/** Companies whose public ATS board answered with open jobs when the list was built (scripts/verify-seed.mjs). */
export const SEED_COMPANIES = seed.companies as SeedCompany[];
export const SEED_VERIFIED_AT = seed.verifiedAt;

export function boardUrl(c: Pick<SeedCompany, 'ats' | 'slug'>): string {
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
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, '');

/**
 * Deterministic relevance: stack overlap + location fit. Used to shortlist
 * candidates for the model and as the fallback when the model is unavailable.
 */
export function rankCompanies(input: { skills: string[]; location?: string | null; remote?: boolean }, limit = 25) {
  const skills = new Set(input.skills.map(norm));
  const loc = (input.location || '').toLowerCase();
  const city = loc.split(',')[0].trim();
  const country = loc.split(',').pop()?.trim() || '';
  return SEED_COMPANIES.map((c) => {
    let score = 0;
    for (const t of c.tags) if (skills.has(norm(t))) score += 3;
    const hq = c.hq.toLowerCase();
    if (city && hq.includes(city)) score += 5;
    if (country && /austria|österreich/.test(country) && /vienna|linz|graz|klagenfurt/.test(hq)) score += 3;
    if (hq.includes('remote') || c.tags.includes('remote')) score += input.remote ? 3 : 1;
    if (/europe|berlin|munich|amsterdam|dublin|paris|london|copenhagen|stockholm|helsinki|zurich|oslo|cologne|barcelona/.test(hq)) score += 1;
    return { company: c, score };
  })
    .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name))
    .slice(0, limit)
    .map((r) => r.company);
}
