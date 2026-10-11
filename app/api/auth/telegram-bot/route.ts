import { NextResponse } from 'next/server';
import { createLoginRequest, pollLogin } from '@/lib/auth/bot-login';
import { loginStore } from '@/lib/auth/bot-login-store';
import { setSessionCookie } from '@/lib/auth/session';

export const instant = false;

const BOT = () => (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'JobberCheck_bot').replace(/^@/, '');

/** Start a bot-based login: {invite?} → {token, url}. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { invite?: unknown };
  const token = await createLoginRequest(loginStore(), typeof body.invite === 'string' ? body.invite : undefined);
  return NextResponse.json({ token, url: `https://t.me/${BOT()}?start=login_${token}` });
}

/** Poll from the original tab: ?token= → {state}; on "done" the session cookie is set here. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const r = await pollLogin(loginStore(), token);
  if (r.state === 'done' && r.uid) await setSessionCookie(r.uid);
  return NextResponse.json({ state: r.state }, { headers: { 'cache-control': 'no-store' } });
}
