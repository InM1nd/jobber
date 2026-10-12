/**
 * Pure rate/quota helpers (no I/O) so they can be unit tested.
 */

export type AiKind = 'score' | 'write' | 'parse';

export interface QuotaLimits {
  score: number;
  write: number;
  parse: number;
}

function intEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/**
 * Per-user daily limits in AI *requests*. A scoring request covers up to
 * SCORE_BATCH jobs. Defaults are sized for the shared free tier
 * (500 requests/day for the whole project, 80 kept for onboarding):
 * a typical active user needs ~6-10 requests/day, so ~40 active users fit.
 * Users with their own key get their own (much larger) limits.
 */
export function dailyLimits(ownKey = false): QuotaLimits {
  if (ownKey) {
    return {
      score: intEnv('AI_BYO_DAILY_SCORE_CALLS', 240),
      write: intEnv('AI_BYO_DAILY_WRITES', 180),
      parse: intEnv('AI_BYO_DAILY_CV_PARSES', 60),
    };
  }
  return {
    score: intEnv('AI_DAILY_SCORE_CALLS', 20),
    write: intEnv('AI_DAILY_WRITES', 15),
    parse: intEnv('AI_DAILY_CV_PARSES', 15),
  };
}

/** Jobs scored per AI request. */
export const SCORE_BATCH = 12;

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function remainingQuota(used: number, limit: number) {
  return Math.max(0, limit - Math.max(0, used));
}

/** How many of `wanted` calls may run now, given usage and limit. */
export function allowance(wanted: number, used: number, limit: number) {
  return Math.min(Math.max(0, wanted), remainingQuota(used, limit));
}

/**
 * Sliding-window limiter: at most `perMinute` starts in any 60s window.
 * `clock` is injectable for tests.
 */
export class SlidingWindowLimiter {
  private starts: number[] = [];
  private blockedUntil = 0;

  constructor(
    private perMinute: number,
    private clock: () => number = () => Date.now(),
  ) {}

  /** Milliseconds to wait before the next call may start (0 = go now). */
  waitTime(): number {
    const now = this.clock();
    this.starts = this.starts.filter((t) => now - t < 60_000);
    const backoff = Math.max(0, this.blockedUntil - now);
    if (this.starts.length < this.perMinute) return backoff;
    return Math.max(backoff, 60_000 - (now - this.starts[0]));
  }

  record() {
    this.starts.push(this.clock());
  }

  /** Called after a 429: nothing may start before now + ms. */
  backoff(ms: number) {
    this.blockedUntil = Math.max(this.blockedUntil, this.clock() + ms);
  }
}

/** Exponential backoff with cap, used for 429/503 retries. */
export function backoffDelay(attempt: number, retryAfterMs?: number, capMs = 30_000) {
  if (retryAfterMs && retryAfterMs > 0) return Math.min(retryAfterMs, capMs * 4);
  return Math.min(capMs, 1000 * 2 ** attempt);
}

/** Gemini 429 bodies carry RetryInfo.retryDelay like "37s". */
export function parseRetryDelay(body: unknown): number | undefined {
  const details = (body as { error?: { details?: Array<Record<string, unknown>> } })?.error?.details;
  if (!Array.isArray(details)) return undefined;
  for (const detail of details) {
    const delay = detail.retryDelay;
    if (typeof delay === 'string') {
      const match = delay.match(/^(\d+(?:\.\d+)?)s$/);
      if (match) return Math.round(Number(match[1]) * 1000);
    }
  }
  return undefined;
}
