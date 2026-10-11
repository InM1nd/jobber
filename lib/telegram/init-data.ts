import crypto from 'crypto';

export const INIT_DATA_MAX_AGE_SECONDS = 60 * 60 * 24;

export interface TelegramWebAppUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export type InitDataResult =
  | {
      ok: true;
      user: TelegramWebAppUser;
      authDate: number;
      startParam?: string;
    }
  | { ok: false; reason: string };

function parsePairs(initData: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const part of initData.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawValue = eq === -1 ? '' : part.slice(eq + 1);
    const key = decodeURIComponent(rawKey);
    const value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    pairs.set(key, value);
  }
  return pairs;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  nowMs = Date.now(),
): InitDataResult {
  if (!botToken) return { ok: false, reason: 'Bot token is not configured' };
  if (!initData.trim()) return { ok: false, reason: 'Missing init data' };

  const pairs = parsePairs(initData);
  const hash = pairs.get('hash');
  if (!hash) return { ok: false, reason: 'Missing hash' };

  const dataCheckString = [...pairs.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (!timingSafeEqualHex(expected, hash)) return { ok: false, reason: 'Bad signature' };

  const authDate = Number(pairs.get('auth_date'));
  if (!Number.isFinite(authDate)) return { ok: false, reason: 'Missing auth date' };
  const age = Math.floor(nowMs / 1000) - authDate;
  if (age > INIT_DATA_MAX_AGE_SECONDS) return { ok: false, reason: 'Auth data is too old' };
  if (age < -300) return { ok: false, reason: 'Auth date is in the future' };

  const rawUser = pairs.get('user');
  if (!rawUser) return { ok: false, reason: 'Missing user' };
  let user: TelegramWebAppUser;
  try {
    const parsed = JSON.parse(rawUser) as TelegramWebAppUser;
    if (!parsed || typeof parsed.id !== 'number') return { ok: false, reason: 'Bad user payload' };
    user = parsed;
  } catch {
    return { ok: false, reason: 'Bad user payload' };
  }

  const startParam = pairs.get('start_param') || undefined;
  return { ok: true, user, authDate, startParam };
}
