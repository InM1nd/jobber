import crypto from 'crypto';
import { open, seal } from '@/lib/auth/signed';

interface OAuthState {
  uid: string;
  verifier: string;
  exp: number;
}

export function buildOpenRouterUrl(userId: string): string {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = seal({
    uid: userId,
    verifier,
    exp: Date.now() + 10 * 60 * 1000,
  } satisfies OAuthState);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:43123';
  const callback = new URL('/api/auth/openrouter/callback', appUrl);
  callback.searchParams.set('state', state);

  const url = new URL('https://openrouter.ai/auth');
  url.searchParams.set('callback_url', callback.toString());
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function readOpenRouterState(state: string | null): OAuthState | null {
  if (!state) return null;
  const payload = open<OAuthState>(state);
  if (!payload?.uid || !payload.verifier || !payload.exp) return null;
  if (payload.exp < Date.now()) return null;
  return payload;
}
