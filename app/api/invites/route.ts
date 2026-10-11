import { NextResponse } from 'next/server';
import { createInvite, requireUser } from '@/lib/data/service';

export const instant = false;

export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  try {
    const code = await createInvite(user);
    return NextResponse.json({ code });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create invite';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
