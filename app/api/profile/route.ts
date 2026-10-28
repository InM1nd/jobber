import { NextResponse } from 'next/server';
import { getProfile, requireUser, saveProfile } from '@/lib/data/service';
import { DraftSchema, profilePatchFromDraft } from '@/lib/profile/draft';
import { rebuildSources } from '@/lib/search/watch';
import { isDemoMode } from '@/lib/demo/mode';
import { MAX_FACTS_CHARS } from '@/lib/profile/facts';

export const instant = false;

/** {draft, writingRules?, facts?} — the guided form is the source of truth. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { draft?: unknown; writingRules?: unknown; facts?: unknown } | null;
  if (!body?.draft) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const before = await getProfile(user.id);
  const patch = profilePatchFromDraft(DraftSchema.parse(body.draft));
  const profile = await saveProfile(user.id, {
    ...patch,
    ...(typeof body.writingRules === 'string' ? { writingRules: body.writingRules.slice(0, 20000) || null } : {}),
    ...(typeof body.facts === 'string' ? { facts: body.facts.slice(0, MAX_FACTS_CHARS).trim() || null } : {}),
  });
  // Keywords or place changed → refresh the keyword-board sources.
  const changed =
    before.location !== patch.location ||
    before.country !== patch.country ||
    JSON.stringify(before.searchKeywords) !== JSON.stringify(patch.searchKeywords) ||
    JSON.stringify(before.openTo) !== JSON.stringify(patch.openTo);
  if (changed && !isDemoMode() && before.onboardedAt) await rebuildSources(user.id);
  return NextResponse.json({ profile });
}
