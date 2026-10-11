import { NextResponse } from 'next/server';
import { consumeLink } from '@/lib/auth/bot-login';
import { loginStore } from '@/lib/auth/bot-login-store';
import { setSessionCookie } from '@/lib/auth/session';

export const instant = false;

/** One-time link from the bot: signs in whatever browser opens it. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const uid = await consumeLink(loginStore(), url.searchParams.get('token') || '', url.searchParams.get('sig') || '');
  if (!uid) {
    const back = new URL('/auth/signin', url.origin);
    back.searchParams.set('error', 'This sign-in link has expired or was already used. Tap “Sign in with Telegram” again.');
    return NextResponse.redirect(back);
  }
  await setSessionCookie(uid);
  return NextResponse.redirect(new URL('/dashboard/matches', url.origin));
}
