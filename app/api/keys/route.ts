import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/data/service';
import { checkGeminiKey, deleteGeminiKey, geminiKeyInfo, saveGeminiKey } from '@/lib/data/keys';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  return NextResponse.json({ key: await geminiKeyInfo(user.id) });
}

/** {key} → verify with Google (free call) and store encrypted. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: 'Needs the database' }, { status: 503 });
  const { key } = (await request.json().catch(() => ({}))) as { key?: string };
  const clean = String(key || '').trim();
  if (!/^[\w-]{30,60}$/.test(clean)) {
    return NextResponse.json({ error: 'That doesn’t look like a Gemini key. It starts with “AIza” and is about 39 characters.' }, { status: 400 });
  }
  if (!(await checkGeminiKey(clean))) {
    return NextResponse.json({ error: 'Google didn’t accept this key. Copy it again from AI Studio (no spaces).' }, { status: 400 });
  }
  await saveGeminiKey(user.id, clean);
  return NextResponse.json({ key: await geminiKeyInfo(user.id) });
}

export async function DELETE() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!isDemoMode()) await deleteGeminiKey(user.id);
  return NextResponse.json({ key: null });
}
