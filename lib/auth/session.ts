import { cookies } from 'next/headers';
import { open, seal } from '@/lib/auth/signed';

const COOKIE = 'jobber_session';

// Same wall-clock time as Date.now(), but readable while Next prerenders a
// prefetch with cookies (Date.now() there aborts the prerender with an error).
const wallClock = () => Math.round(performance.timeOrigin + performance.now());
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function readSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const payload = open<{ uid?: string; exp?: number }>(token);
  if (!payload?.uid || !payload.exp || payload.exp < wallClock()) return null;
  return payload.uid;
}

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  const token = seal({ uid: userId, exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const secure = process.env.NODE_ENV === 'production';
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}
