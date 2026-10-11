import { NextResponse } from 'next/server';
import { createLinkCode, requireUser } from '@/lib/data/service';

export const instant = false;

export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const link = await createLinkCode(user.id);
  return NextResponse.json(link);
}
