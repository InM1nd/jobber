import { NextResponse } from 'next/server';
import { seal } from '@/lib/auth/signed';
import { requireUser } from '@/lib/data/service';

export const instant = false;

/** Signed one-hour claim that lets the magic-link callback attach the email to this account. */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  try {
    return NextResponse.json({ token: seal({ uid: user.id, purpose: 'link-email', exp: Date.now() + 60 * 60 * 1000 }) });
  } catch {
    return NextResponse.json({ error: 'Email linking is not configured' }, { status: 500 });
  }
}
