import { z } from 'zod';
import { parseJsonLoose } from './gemini';
import { runAi } from './run';
import { placeLabel, rankCompanies, type SeedCompany } from '@/lib/companies/seed';
import type { Draft } from '@/lib/profile/draft';

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
export function fallbackKeywords(profile: Pick<Draft, 'targetRoles' | 'skills'>) {
  const fromRoles = profile.targetRoles.map((r) => r.replace(/\b(senior|junior|lead|mid|principal|staff)\b/gi, '').trim());
  return clean([...fromRoles, ...profile.skills.slice(0, 3)].map((s) => s.toLowerCase()), 6);
}

/** Only companies from the verified seed list can come back, whatever the model says. */
export function applyPlan(raw: unknown, shortlist: SeedCompany[], profile: Pick<Draft, 'targetRoles' | 'skills'>, max = 12): SearchPlan {
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

/** One AI request: titles, keywords and which verified companies fit. Falls back to ranking. */
export async function buildSearchPlan(userId: string, profile: Draft): Promise<SearchPlan> {
  const remote = profile.openTo.includes('remote');
  const shortlist = rankCompanies({ skills: profile.skills, city: profile.city, country: profile.country, remote, workField: profile.workField }, 40);
  const prompt = `Candidate:
- Work field: ${profile.workField || 'unknown'}
- Target roles: ${profile.targetRoles.join(', ')}
- Level: ${profile.seniority}${profile.stretch ? ' (also one level up)' : ''}, ${profile.yearsExperience ?? '?'} years
- Skills: ${profile.skills.slice(0, 20).join(', ')}
- Location: ${[profile.city, profile.country].filter(Boolean).join(', ') || 'unknown'}; open to: ${profile.openTo.join(', ')}
- Languages: ${profile.languages.map((l) => `${l.name} ${l.level}`).join(', ')}
- Avoid: ${profile.avoidKeywords.join(', ') || 'nothing'}

Companies (name | where they hire | industry | tags) — pick ONLY from this list, copy names exactly:
${shortlist.map((c) => `${c.name} | ${placeLabel(c)} | ${c.industry} | ${c.tags.join(',')}`).join('\n')}

Return JSON: {"titles": 3-6 job titles to search, "keywords": 3-6 short search keywords for job boards (lowercase, e.g. "frontend developer", "react"), "companies": 8-14 names from the list most likely to hire this person (location fit first, then field and stack)}`;
  try {
    const reply = await runAi(userId, 'parse', prompt, { onboarding: true, tier: 'smart', json: true, temperature: 0.2, maxTokens: 1500 });
    return applyPlan(parseJsonLoose(reply), shortlist, profile, 14);
  } catch {
    return applyPlan({}, shortlist, profile, 14);
  }
}
