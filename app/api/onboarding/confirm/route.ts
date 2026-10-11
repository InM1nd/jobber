import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, saveProfile } from '@/lib/data/service';
import { DraftSchema, profilePatchFromDraft } from '@/lib/profile/draft';
import { rebuildSources } from '@/lib/search/watch';
import { runView, startSearchRun } from '@/lib/search/pipeline';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;
export const maxDuration = 60;

const Company = z.object({
  name: z.string().min(1).max(80),
  ats: z.string().min(2).max(20),
  slug: z.string().min(1).max(120),
  cities: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
});

/** Saves the final form + ticked companies, builds sources, starts the first run. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: 'Onboarding needs the database (demo mode).' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { draft?: unknown; companies?: unknown };
  const draft = DraftSchema.parse(body.draft ?? {});
  const companies = z.array(Company).max(60).catch([]).parse(body.companies);
  await saveProfile(user.id, { ...profilePatchFromDraft(draft), onboardedAt: new Date().toISOString() });
  const sourceIds = await rebuildSources(user.id, companies);
  const run = await startSearchRun(user.id);
  return NextResponse.json({ sources: sourceIds.length, run: runView(run) });
}
