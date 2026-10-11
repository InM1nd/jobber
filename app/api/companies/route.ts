import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProfile, requireUser } from '@/lib/data/service';
import { detectCompany } from '@/lib/companies/detect';
import { placeLabel, rankCompanies, SEED_COMPANIES } from '@/lib/companies/seed';
import { rebuildSources, watchList } from '@/lib/search/watch';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;
export const maxDuration = 30;

/** Watch list + suggestions from the verified dataset. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ watching: [], suggestions: [] });
  const [profile, watching] = await Promise.all([getProfile(user.id), watchList(user.id)]);
  const names = new Set(watching.map((w) => w.name));
  const [city, country] = (profile.location || '').split(',').map((s) => s.trim());
  const suggestions = rankCompanies(
    { skills: profile.skills, city, country: profile.country || country, remote: (profile.openTo || []).includes('remote'), workField: profile.workField },
    30,
  )
    .filter((c) => !names.has(c.name))
    .map((c) => ({ name: c.name, ats: c.ats, slug: c.slug, industry: c.industry, place: placeLabel(c), jobs: c.jobs, cities: c.cities, countries: c.countries }));
  const watchingView = watching.map((w) => {
    const seed = SEED_COMPANIES.find((s) => s.name === w.name);
    return { ...w, place: seed ? placeLabel(seed) : null, industry: seed?.industry ?? null };
  });
  return NextResponse.json({ watching: watchingView, suggestions, datasetSize: SEED_COMPANIES.length });
}

/** {input} → detect a company by name or careers URL (no AI). */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { input } = (await request.json().catch(() => ({}))) as { input?: string };
  if (!input?.trim()) return NextResponse.json({ error: 'Type a company name or paste its careers page link' }, { status: 400 });
  const found = await detectCompany(input.slice(0, 300));
  if (!found) {
    return NextResponse.json(
      { error: 'Couldn’t find a public job board for that. Try the link of their careers page (the page that lists open jobs).' },
      { status: 404 },
    );
  }
  return NextResponse.json({ company: found });
}

const Company = z.object({ name: z.string().min(1).max(80), ats: z.string().min(2).max(20), slug: z.string().min(1).max(120) });

/** {companies} → replace the watch list (checked daily). */
export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: 'Needs the database' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { companies?: unknown };
  const parsed = z.array(Company).max(60).safeParse(body.companies);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid list' }, { status: 400 });
  const withPlaces = parsed.data.map((c) => {
    const seed = SEED_COMPANIES.find((s) => s.ats === c.ats && s.slug === c.slug);
    return { ...c, cities: seed?.cities, countries: seed?.countries };
  });
  const ids = await rebuildSources(user.id, withPlaces);
  return NextResponse.json({ ok: true, sources: ids.length });
}
