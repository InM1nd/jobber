import { NextResponse } from 'next/server';
import { requireUser, saveProfile } from '@/lib/data/service';
import { DraftSchema, profilePatchFromDraft } from '@/lib/profile/draft';
import { buildSearchPlan } from '@/lib/ai/search-plan';
import { placeLabel, rankCompanies } from '@/lib/companies/seed';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;
export const maxDuration = 60;

/** Saves the form and proposes keywords + companies to watch (1 AI request). */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: 'Needs the database (demo mode).' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { draft?: unknown };
  const draft = DraftSchema.parse(body.draft ?? {});
  await saveProfile(user.id, profilePatchFromDraft(draft));

  const plan = await buildSearchPlan(user.id, draft);
  const picked = new Set(plan.companies.map((c) => c.name));
  const more = rankCompanies(
    { skills: draft.skills, city: draft.city, country: draft.country, remote: draft.openTo.includes('remote'), workField: draft.workField },
    40,
  ).filter((c) => !picked.has(c.name));
  const view = (c: (typeof plan.companies)[number], suggested: boolean) => ({
    name: c.name, ats: c.ats, slug: c.slug, industry: c.industry, place: placeLabel(c), jobs: c.jobs, cities: c.cities, countries: c.countries, suggested,
  });
  return NextResponse.json({
    titles: plan.titles,
    keywords: draft.keywords.length ? draft.keywords : plan.keywords,
    aiPicked: plan.aiPicked,
    companies: [...plan.companies.map((c) => view(c, true)), ...more.slice(0, 16).map((c) => view(c, false))],
  });
}
