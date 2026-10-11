import { z } from 'zod';
import { gemini, parseJsonLoose } from './gemini';
import { rankCompanies, type SeedCompany } from '@/lib/companies/seed';
import type { CvProfile } from './cv-profile';

export interface SearchPlan {
  titles: string[];
  keywords: string[];
  companies: SeedCompany[];
  /** true when the model picked; false when we fell back to deterministic ranking */
  aiPicked: boolean;
}

const PlanSchema = z.object({
  titles: z.array(z.string()).catch([]),
  keywords: z.array(z.string()).catch([]),
  companies: z.array(z.string()).catch([]),
});

function clean(list: string[], max: number) {
  return [...new Set(list.map((s) => s.trim()).filter((s) => s && s.length <= 60))].slice(0, max);
}

/** Keyword list for free-text boards: short, lowercase, title-ish. */
export function fallbackKeywords(profile: Pick<CvProfile, 'targetRoles' | 'skills'>) {
  const fromRoles = profile.targetRoles.map((r) => r.replace(/\b(senior|junior|lead|mid|principal|staff)\b/gi, '').trim());
  return clean([...fromRoles, ...profile.skills.slice(0, 3)].map((s) => s.toLowerCase()), 6);
}

/** Only companies from the verified seed list can come back, whatever the model says. */
export function applyPlan(raw: unknown, shortlist: SeedCompany[], profile: CvProfile, max = 12): SearchPlan {
  const plan = PlanSchema.parse(raw ?? {});
  const byName = new Map(shortlist.map((c) => [c.name.toLowerCase(), c]));
  const companies = clean(plan.companies, 30)
    .map((n) => byName.get(n.toLowerCase()))
    .filter((c): c is SeedCompany => Boolean(c))
    .slice(0, max);
  const titles = clean(plan.titles, 6);
  const keywords = clean(plan.keywords.map((k) => k.toLowerCase()), 8);
  return {
    titles: titles.length ? titles : profile.targetRoles,
    keywords: keywords.length ? keywords : fallbackKeywords(profile),
    companies: companies.length >= 3 ? companies : shortlist.slice(0, max),
    aiPicked: companies.length >= 3,
  };
}

export async function buildSearchPlan(profile: CvProfile): Promise<SearchPlan> {
  const remote = profile.remotePreference === 'remote';
  const shortlist = rankCompanies({ skills: profile.skills, location: profile.location, remote }, 30);
  const prompt = `Candidate:
- Target roles: ${profile.targetRoles.join(', ')}
- Seniority: ${profile.seniority}, ${profile.yearsExperience ?? '?'} years
- Skills: ${profile.skills.join(', ')}
- Location: ${profile.location || 'unknown'}; prefers ${profile.remotePreference}
- Languages: ${profile.languages.join(', ')}

Companies (name | HQ | stack tags) — pick ONLY from this list, copy names exactly:
${shortlist.map((c) => `${c.name} | ${c.hq} | ${c.tags.join(',')}`).join('\n')}

Return JSON: {"titles": 3-6 job titles to search, "keywords": 3-6 short search keywords for job boards (e.g. "react", "frontend engineer"), "companies": 8-12 names from the list most likely to hire this person (stack + location fit)}`;
  try {
    const reply = await gemini(prompt, { tier: 'smart', json: true, temperature: 0.2, maxTokens: 1500 });
    return applyPlan(parseJsonLoose(reply), shortlist, profile);
  } catch {
    return applyPlan({}, shortlist, profile);
  }
}
