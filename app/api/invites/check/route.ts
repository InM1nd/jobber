import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkInvite } from '@/lib/data/service';

export const instant = false;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const code = String((body as { code?: string } | null)?.code || '');
  const ok = await checkInvite(code);
  if (!ok) {
    return NextResponse.json({ error: 'Invite code is not valid' }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set('jobber_invite', code.trim(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60,
  });

  return NextResponse.json({ ok: true });
}
