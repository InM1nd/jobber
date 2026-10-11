import crypto from 'crypto';
import { open, seal } from './signed';

/**
 * Bot-based Telegram sign-in (replaces the Login Widget, no /setdomain needed).
 *
 * 1. Web creates a login request: random token (kept only by that browser tab + the t.me link),
 *    stored server-side under sha256(token) with status "pending" (5-minute window).
 * 2. User opens t.me/<bot>?start=login_<token>, taps "Yes, sign me in" → request is bound to
 *    their Telegram user (invite rules as in the Mini App) and the bot shows a signed,
 *    single-use link /auth/telegram-link?token=…&sig=…
 * 3. Either the original tab's poll or the link (any browser) sets the session — each once.
 *
 * Storage is a tiny KV (CronJob rows in prod) so no migration is needed.
 */

export const LOGIN_TTL_MS = 5 * 60 * 1000;

export interface LoginRow {
  s: 'pending' | 'confirmed';
  at: number;
  invite?: string;
  uid?: string;
  link?: boolean;
  poll?: boolean;
}

export interface LoginStore {
  get(key: string): Promise<LoginRow | null>;
  set(key: string, row: LoginRow): Promise<void>;
  /** Atomic compare-and-set: writes only if the stored row still equals `expected`. */
  swap(key: string, expected: LoginRow, next: LoginRow): Promise<boolean>;
}

const keyOf = (token: string) => `login:${crypto.createHash('sha256').update(token).digest('hex')}`;
const fresh = (row: LoginRow, now: number) => now - row.at < LOGIN_TTL_MS;
const validToken = (t: string) => /^[A-Za-z0-9_-]{32,64}$/.test(t);

export async function createLoginRequest(store: LoginStore, invite?: string, now = Date.now()) {
  const token = crypto.randomBytes(24).toString('base64url'); // 32 chars, fits Telegram's 64-char start param
  await store.set(keyOf(token), { s: 'pending', at: now, invite: invite?.trim().slice(0, 64) || undefined });
  return token;
}

export async function loginInvite(store: LoginStore, token: string, now = Date.now()) {
  if (!validToken(token)) return { ok: false as const };
  const row = await store.get(keyOf(token));
  if (!row || row.s !== 'pending' || !fresh(row, now)) return { ok: false as const };
  return { ok: true as const, invite: row.invite };
}

/** Bot side: bind the pending request to a Jobber user id. Returns the signed one-time link params. */
export async function confirmLogin(store: LoginStore, token: string, uid: string, now = Date.now()) {
  if (!validToken(token)) return null;
  const key = keyOf(token);
  const row = await store.get(key);
  if (!row || row.s !== 'pending' || !fresh(row, now)) return null;
  const next: LoginRow = { ...row, s: 'confirmed', uid, at: now };
  if (!(await store.swap(key, row, next))) return null;
  const sig = seal({ p: 'tg-login', k: key, u: uid, e: now + LOGIN_TTL_MS });
  return { token, sig };
}

/** /auth/telegram-link: verify signature + expiry, single use. Returns the user id. */
export async function consumeLink(store: LoginStore, token: string, sig: string, now = Date.now()) {
  const claim = open<{ p?: string; k?: string; u?: string; e?: number }>(sig);
  if (!claim || claim.p !== 'tg-login' || !claim.u || !claim.e || claim.e < now) return null;
  if (!validToken(token) || claim.k !== keyOf(token)) return null;
  const row = await store.get(claim.k);
  if (!row || row.s !== 'confirmed' || row.uid !== claim.u || row.link) return null;
  if (!(await store.swap(claim.k, row, { ...row, link: true }))) return null;
  return claim.u;
}

/** Original tab polling. Single use as well. */
export async function pollLogin(store: LoginStore, token: string, now = Date.now()): Promise<{ state: 'pending' | 'expired' | 'done'; uid?: string }> {
  if (!validToken(token)) return { state: 'expired' };
  const key = keyOf(token);
  const row = await store.get(key);
  if (!row) return { state: 'expired' };
  if (row.s === 'pending') return fresh(row, now) ? { state: 'pending' } : { state: 'expired' };
  if (row.poll || !fresh(row, now) || !row.uid) return { state: 'expired' };
  if (!(await store.swap(key, row, { ...row, poll: true }))) return { state: 'expired' };
  return { state: 'done', uid: row.uid };
}

/** In-memory store (tests, demo mode). */
export function memoryStore(): LoginStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    async get(k) { const v = map.get(k); return v ? (JSON.parse(v) as LoginRow) : null; },
    async set(k, r) { map.set(k, JSON.stringify(r)); },
    async swap(k, e, n) { if (map.get(k) !== JSON.stringify(e)) return false; map.set(k, JSON.stringify(n)); return true; },
  };
}
