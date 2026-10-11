import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { validateTelegramLogin } from './telegram-login';
import { createLinkCode, readLinkCode } from './link-code';

const TOKEN = '123456:test-token';

function sign(data: Record<string, string | number>) {
  const check = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('\n');
  const secret = crypto.createHash('sha256').update(TOKEN).digest();
  return { ...data, hash: crypto.createHmac('sha256', secret).update(check).digest('hex') };
}

describe('validateTelegramLogin', () => {
  const now = 1_800_000_000_000;
  const base = { id: 336128859, first_name: 'A', username: 'alex', auth_date: Math.floor(now / 1000) - 10 };

  it('accepts a correctly signed payload', () => {
    expect(validateTelegramLogin(sign(base), TOKEN, now)).toEqual({ ok: true, id: '336128859', username: 'alex' });
  });
  it('rejects a tampered payload', () => {
    const signed = sign(base);
    expect(validateTelegramLogin({ ...signed, id: 1 }, TOKEN, now).ok).toBe(false);
  });
  it('rejects the Mini App key derivation', () => {
    const check = Object.keys(base).sort().map((k) => `${k}=${(base as Record<string, unknown>)[k]}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
    const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
    expect(validateTelegramLogin({ ...base, hash }, TOKEN, now).ok).toBe(false);
  });
  it('rejects stale logins', () => {
    expect(validateTelegramLogin(sign({ ...base, auth_date: base.auth_date - 2 * 86400 }), TOKEN, now).ok).toBe(false);
  });
});

describe('link codes', () => {
  const secret = 'a'.repeat(64);
  const uid = '2f1c9a3e-8b4d-4e6f-9a1b-0c2d3e4f5a6b';
  it('round-trips and fits a Telegram start param', () => {
    const code = createLinkCode(uid, 0, secret);
    expect(`link_${code}`.length).toBeLessThanOrEqual(64);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(readLinkCode(code, 1000, secret)).toBe(uid);
  });
  it('expires and rejects forgery', () => {
    const code = createLinkCode(uid, 0, secret);
    expect(readLinkCode(code, 16 * 60 * 1000, secret)).toBeNull();
    expect(readLinkCode(code, 0, 'b'.repeat(64))).toBeNull();
  });
});
