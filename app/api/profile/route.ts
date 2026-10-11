import { NextResponse } from 'next/server';
import { requireUser, saveProfile } from '@/lib/data/service';

export const instant = false;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 80);
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const salaryMin = data.salaryMin === '' || data.salaryMin == null ? null : Number(data.salaryMin);
  const salaryMax = data.salaryMax === '' || data.salaryMax == null ? null : Number(data.salaryMax);

  const profile = await saveProfile(user.id, {
    skills: asStringArray(data.skills),
    stackKeywords: asStringArray(data.stackKeywords),
    skillGaps: asStringArray(data.skillGaps),
    languages: asStringArray(data.languages),
    watchedCompanies: asStringArray(data.watchedCompanies),
    location: data.location ? String(data.location).slice(0, 120) : null,
    countryEligible: data.countryEligible ? String(data.countryEligible).slice(0, 120) : null,
    remoteOnly: Boolean(data.remoteOnly),
    salaryMin: Number.isFinite(salaryMin) ? salaryMin : null,
    salaryMax: Number.isFinite(salaryMax) ? salaryMax : null,
    writingRules: data.writingRules ? String(data.writingRules).slice(0, 20000) : null,
  });

  return NextResponse.json({ profile });
}
