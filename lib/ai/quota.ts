import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';
import { AiKind, allowance, dailyLimits, utcDay } from './limiter';

export class QuotaExceededError extends Error {
  constructor(public kind: AiKind, public limit: number) {
    super(`You’ve used today’s ${kind === 'score' ? 'scoring' : kind === 'parse' ? 'CV reading' : 'writing'} limit (${limit} requests). It resets at 02:00 Vienna time. Add your own free Gemini key in Settings for much higher limits.`);
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

/** The owner (OWNER_TELEGRAM_ID) has no per-user limits; the shared-key budget still applies. */
const ownerCache = new Map<string, boolean>();
export async function isUnlimited(userId: string) {
  const owner = process.env.OWNER_TELEGRAM_ID;
  if (!owner || isDemoMode()) return false;
  if (!ownerCache.has(userId)) {
    const u = await getPrisma().user.findUnique({ where: { id: userId }, select: { telegramId: true } });
    ownerCache.set(userId, u?.telegramId === owner);
  }
  return ownerCache.get(userId)!;
}

/** How many `kind` calls the user may still make today (capped at wanted). */
export async function quotaAllowance(userId: string, kind: AiKind, wanted: number, ownKey = false) {
  if (await isUnlimited(userId)) return wanted;
  return allowance(wanted, await usedToday(userId, kind), dailyLimits(ownKey)[kind]);
}

/** Throws QuotaExceededError when the user has none left; otherwise records one use. */
export async function assertQuota(userId: string, kind: AiKind, ownKey = false) {
  const limit = dailyLimits(ownKey)[kind];
  if ((await quotaAllowance(userId, kind, 1, ownKey)) < 1) throw new QuotaExceededError(kind, limit);
}

export async function usageSummary(userId: string, ownKey = false) {
  const limits = (await isUnlimited(userId)) ? { score: -1, write: -1, parse: -1 } : dailyLimits(ownKey);
  const [score, write, parse] = await Promise.all([
    usedToday(userId, 'score'),
    usedToday(userId, 'write'),
    usedToday(userId, 'parse'),
  ]);
  return { limits, used: { score, write, parse } };
}
