import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';
import { AiKind, allowance, dailyLimits, utcDay } from './limiter';

export class QuotaExceededError extends Error {
  constructor(public kind: AiKind, public limit: number) {
    super(`Daily ${kind} limit reached (${limit}). It resets at midnight UTC.`);
    this.name = 'QuotaExceededError';
  }
}

const demoUsage = new Map<string, number>();

export async function usedToday(userId: string, kind: AiKind): Promise<number> {
  const day = utcDay();
  if (isDemoMode()) return demoUsage.get(`${userId}:${day}:${kind}`) || 0;
  const row = await getPrisma().aiUsage.findUnique({
    where: { userId_day_kind: { userId, day, kind } },
  });
  return row?.count || 0;
}

export async function addUsage(userId: string, kind: AiKind, n = 1) {
  if (n <= 0) return;
  const day = utcDay();
  if (isDemoMode()) {
    const k = `${userId}:${day}:${kind}`;
    demoUsage.set(k, (demoUsage.get(k) || 0) + n);
    return;
  }
  await getPrisma().aiUsage.upsert({
    where: { userId_day_kind: { userId, day, kind } },
    create: { userId, day, kind, count: n },
    update: { count: { increment: n } },
  });
}

/** How many `kind` calls the user may still make today (capped at wanted). */
export async function quotaAllowance(userId: string, kind: AiKind, wanted: number) {
  return allowance(wanted, await usedToday(userId, kind), dailyLimits()[kind]);
}

/** Throws QuotaExceededError when the user has none left; otherwise records one use. */
export async function consumeOne(userId: string, kind: AiKind) {
  const limit = dailyLimits()[kind];
  if ((await quotaAllowance(userId, kind, 1)) < 1) throw new QuotaExceededError(kind, limit);
  await addUsage(userId, kind, 1);
}

export async function usageSummary(userId: string) {
  const limits = dailyLimits();
  const [score, write, parse] = await Promise.all([
    usedToday(userId, 'score'),
    usedToday(userId, 'write'),
    usedToday(userId, 'parse'),
  ]);
  return { limits, used: { score, write, parse } };
}
