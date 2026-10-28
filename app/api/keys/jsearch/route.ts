import { NextResponse } from 'next/server';
import { getProfile, requireUser } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';
import { deleteJSearchKey, jsearchKeyFor, jsearchKeyInfo, jsearchUsage, saveJSearchKey, type JSearchHost } from '@/lib/sources/jsearch';
import { deactivateJSearch, rebuildSources } from '@/lib/search/watch';

export const instant = false;

async function view(userId: string) {
  const [key, creds, usage] = await Promise.all([jsearchKeyInfo(userId), jsearchKeyFor(userId), jsearchUsage(userId)]);
  return { key, active: Boolean(creds), fromEnv: Boolean(creds && !creds.own), usage };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ key: null, active: false, fromEnv: false, usage: { used: 0, limit: 180 } });
  return NextResponse.json(await view(user.id));
}

/** {host: "openwebninja" | "rapidapi", key} → stored encrypted; LinkedIn/Indeed search starts with the next run. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: 'Needs the database' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { host?: string; key?: string };
  const host: JSearchHost = body.host === 'rapidapi' ? 'rapidapi' : 'openwebninja';
  const key = String(body.key || '').trim();
  if (!/^[\w-]{20,120}$/.test(key)) return NextResponse.json({ error: 'That doesn’t look like an API key. Copy it again, without spaces.' }, { status: 400 });
  await saveJSearchKey(user.id, host, key);
  const profile = await getProfile(user.id);
  if (profile.onboardedAt) await rebuildSources(user.id);
  return NextResponse.json(await view(user.id));
}

export async function DELETE() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!isDemoMode()) {
    await deleteJSearchKey(user.id);
    if (!(await jsearchKeyFor(user.id))) await deactivateJSearch(user.id);
  }
  return NextResponse.json(isDemoMode() ? { key: null, active: false } : await view(user.id));
}
