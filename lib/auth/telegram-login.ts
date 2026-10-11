import crypto from 'crypto';

/** Payload the Telegram Login Widget hands to the page (https://core.telegram.org/widgets/login). */
export interface TelegramLoginPayload {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

export const LOGIN_MAX_AGE_SECONDS = 24 * 60 * 60;

export type LoginCheck =
  | { ok: true; id: string; username?: string }
  | { ok: false; reason: string };

/**
 * Login Widget check: secret_key = SHA256(bot_token),
 * hash = hex(HMAC_SHA256(data_check_string, secret_key)).
 * Differs from Mini App initData, which uses HMAC("WebAppData", token).
 */
export function validateTelegramLogin(
  input: Record<string, unknown>,
  botToken: string,
  nowMs = Date.now(),
): LoginCheck {
  if (!botToken) return { ok: false, reason: 'Bot token is not configured' };
  const hash = typeof input.hash === 'string' ? input.hash : '';
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'Missing hash' };

  const dataCheckString = Object.keys(input)
    .filter((key) => key !== 'hash' && input[key] !== undefined && input[key] !== null && input[key] !== '')
    .sort()
    .map((key) => `${key}=${String(input[key])}`)
    .join('\n');

  const secret = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'Bad signature' };

  const authDate = Number(input.auth_date);
  if (!Number.isFinite(authDate)) return { ok: false, reason: 'Missing auth date' };
  const age = Math.floor(nowMs / 1000) - authDate;
  if (age > LOGIN_MAX_AGE_SECONDS) return { ok: false, reason: 'Login is too old' };
  if (age < -300) return { ok: false, reason: 'Auth date is in the future' };

  const id = String(input.id ?? '');
  if (!/^\d+$/.test(id)) return { ok: false, reason: 'Bad user id' };
  const username = typeof input.username === 'string' && input.username ? input.username : undefined;
  return { ok: true, id, username };
}
