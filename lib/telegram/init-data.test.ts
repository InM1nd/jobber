import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { validateTelegramInitData } from './init-data';

const BOT_TOKEN = '123456:test-token';

function buildInitData(fields: Record<string, string>, token = BOT_TOKEN): string {
  const pairs = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return [...pairs, ['hash', hash] as const]
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

describe('Telegram initData', () => {
  const now = Date.UTC(2026, 9, 11, 12, 0, 0);

  it('accepts a fresh payload and reads the user and start param', () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(now / 1000)),
      query_id: 'AAE',
      start_param: 'jobber-abc',
      user: JSON.stringify({ id: 42, username: 'oleksandr', first_name: 'Oleksandr' }),
    });

    const result = validateTelegramInitData(initData, BOT_TOKEN, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.id).toBe(42);
    expect(result.user.username).toBe('oleksandr');
    expect(result.startParam).toBe('jobber-abc');
  });

  it('rejects a tampered hash', () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(now / 1000)),
      user: JSON.stringify({ id: 7 }),
    });
    const tampered = initData.replace('hash=', 'hash=00');
    const result = validateTelegramInitData(tampered, BOT_TOKEN, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/signature/i);
  });

  it('rejects a payload signed with another bot token', () => {
    const initData = buildInitData(
      {
        auth_date: String(Math.floor(now / 1000)),
        user: JSON.stringify({ id: 7 }),
      },
      '999:other',
    );
    expect(validateTelegramInitData(initData, BOT_TOKEN, now).ok).toBe(false);
  });

  it('rejects stale auth_date', () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(now / 1000) - 60 * 60 * 24 - 10),
      user: JSON.stringify({ id: 7 }),
    });
    const result = validateTelegramInitData(initData, BOT_TOKEN, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/old/i);
  });

  it('rejects a missing hash', () => {
    const result = validateTelegramInitData('auth_date=1&user=%7B%7D', BOT_TOKEN, now);
    expect(result.ok).toBe(false);
  });
});
