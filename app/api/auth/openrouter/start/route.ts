import { NextResponse } from 'next/server';
import { buildOpenRouterUrl } from '@/lib/auth/openrouter';
import { requireUser } from '@/lib/data/service';

export const instant = false;

export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  return NextResponse.json({ url: buildOpenRouterUrl(user.id) });
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:43123';
    return NextResponse.redirect(new URL('/auth/signin', appUrl));
  }
  return NextResponse.redirect(buildOpenRouterUrl(user.id));
}
