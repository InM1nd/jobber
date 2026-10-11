import { NextResponse } from 'next/server';
import { requireUser, saveProfile } from '@/lib/data/service';
import { CvProfileSchema } from '@/lib/ai/cv-profile';
import { buildSearchPlan } from '@/lib/ai/search-plan';
import { ensureSources, runView, startSearchRun } from '@/lib/search/pipeline';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;
export const maxDuration = 60;

/** Saves the confirmed profile, builds the search plan and starts the first run. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: 'Onboarding needs the database (demo mode).' }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { profile?: unknown };
  const profile = CvProfileSchema.parse(body.profile ?? {});

  const plan = await buildSearchPlan(profile);
  const sourceIds = await ensureSources(plan.companies, plan.keywords);
  await saveProfile(user.id, {
    fullName: profile.fullName,
    targetRoles: profile.targetRoles,
    seniority: profile.seniority,
    yearsExperience: profile.yearsExperience,
    skills: profile.skills,
    languages: profile.languages,
    location: profile.location,
    remoteOnly: profile.remotePreference === 'remote',
    salaryMin: profile.salaryMin,
    salaryMax: profile.salaryMax,
    skillGaps: profile.gaps,
    stackKeywords: profile.skills.slice(0, 8),
    searchKeywords: plan.keywords,
    watchedCompanies: plan.companies.map((c) => c.name),
    sourceIds,
    onboardedAt: new Date().toISOString(),
  });
  const run = await startSearchRun(user.id);
  return NextResponse.json({
    plan: { titles: plan.titles, keywords: plan.keywords, companies: plan.companies.map((c) => ({ name: c.name, hq: c.hq, ats: c.ats })), aiPicked: plan.aiPicked },
    run: runView(run),
  });
}
