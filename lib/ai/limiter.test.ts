import { afterEach, describe, expect, it } from 'vitest';
import { SlidingWindowLimiter, allowance, backoffDelay, dailyLimits, parseRetryDelay, remainingQuota, utcDay } from './limiter';

describe('quota maths', () => {
  afterEach(() => {
    delete process.env.AI_DAILY_SCORES;
  });

  it('caps the allowance by what is left today', () => {
    expect(allowance(10, 55, 60)).toBe(5);
    expect(allowance(3, 0, 60)).toBe(3);
    expect(allowance(10, 80, 60)).toBe(0);
    expect(remainingQuota(-5, 10)).toBe(10);
  });

  it('reads limits from env with sane fallbacks', () => {
    process.env.AI_DAILY_SCORE_CALLS = '25';
    expect(dailyLimits().score).toBe(25);
    process.env.AI_DAILY_SCORE_CALLS = 'lots';
    expect(dailyLimits().score).toBe(6);
    expect(dailyLimits(true).score).toBe(80);
  });

  it('uses UTC days', () => {
    expect(utcDay(new Date('2026-10-11T23:30:00-02:00'))).toBe('2026-10-12');
  });
});

describe('SlidingWindowLimiter', () => {
  it('allows N starts per minute, then waits for the oldest to expire', () => {
    let now = 0;
    const l = new SlidingWindowLimiter(2, () => now);
    expect(l.waitTime()).toBe(0);
    l.record();
    now = 10_000;
    l.record();
    expect(l.waitTime()).toBe(50_000);
    now = 60_001;
    expect(l.waitTime()).toBe(0);
  });

  it('honours a backoff after a 429', () => {
    let now = 1000;
    const l = new SlidingWindowLimiter(10, () => now);
    l.backoff(30_000);
    expect(l.waitTime()).toBe(30_000);
    now += 30_000;
    expect(l.waitTime()).toBe(0);
  });
});

describe('backoff', () => {
  it('grows exponentially and is capped', () => {
    expect(backoffDelay(0)).toBe(1000);
    expect(backoffDelay(3)).toBe(8000);
    expect(backoffDelay(10)).toBe(30_000);
    expect(backoffDelay(0, 42_000)).toBe(42_000);
  });

  it('parses Gemini RetryInfo', () => {
    const body = { error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }] } };
    expect(parseRetryDelay(body)).toBe(37_000);
    expect(parseRetryDelay({})).toBeUndefined();
  });
});
