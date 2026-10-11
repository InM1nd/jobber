import { NextResponse } from 'next/server';
import { requireUser, unlinkAccount } from '@/lib/data/service';

export const instant = false;

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { kind?: string };
  if (body.kind !== 'telegram' && body.kind !== 'email') {
    return NextResponse.json({ error: 'Unknown account type' }, { status: 400 });
  }
  const result = await unlinkAccount(user.id, body.kind);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  if (body.kind === 'email' && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { createClient } = await import('@/lib/db/supabase-server');
    const supabase = await createClient();
    await supabase.auth.signOut().catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
