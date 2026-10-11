import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';

/**
 * Global daily budget for the SHARED key. Gemini's RPD is per project and
 * resets at midnight Pacific time, so we count per Pacific day and per model.
 * Part of the lite budget is reserved for onboarding (CV reading + plan) so a
 * busy day of scoring can't lock new users out.
 */

export function pacificDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const int = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
};

export function dailyBudget(model: string) {
  const lite = model.includes('lite');
  return {
    limit: lite ? int('GEMINI_RPD_LITE', 500) : int('GEMINI_RPD_FLASH', 20),
    // Keep a small safety margin under Google's hard limit.
    margin: lite ? int('GEMINI_RPD_MARGIN', 20) : 2,
    onboardingReserve: lite ? int('GEMINI_ONBOARDING_RESERVE', 80) : 0,
  };
}

/** Requests the given purpose may still use today (pure; tested). */
export function budgetLeft(used: number, model: string, onboarding: boolean) {
  const b = dailyBudget(model);
  const cap = b.limit - b.margin - (onboarding ? 0 : b.onboardingReserve);
  return Math.max(0, cap - used);
}

export class BudgetExhaustedError extends Error {
  constructor(public model: string) {
    super('The shared AI has used today’s free quota. It resets at 09:00 Vienna time — or add your own free Gemini key in Settings.');
    this.name = 'BudgetExhaustedError';
  }
}

const demo = new Map<string, number>();

/** Atomically takes one request from today's shared budget, or throws. */
export async function takeShared(model: string, onboarding: boolean) {
  const day = pacificDay();
  const b = dailyBudget(model);
  const cap = b.limit - b.margin - (onboarding ? 0 : b.onboardingReserve);
  if (isDemoMode()) {
    const k = `${day}:${model}`;
    const used = demo.get(k) || 0;
    if (used >= cap) throw new BudgetExhaustedError(model);
    demo.set(k, used + 1);
    return;
  }
  const rows = await getPrisma().$queryRaw<Array<{ count: number }>>`
    insert into "GlobalAiUsage" ("day", "model", "count", "updatedAt") values (${day}, ${model}, 1, now())
    on conflict ("day", "model") do update set "count" = "GlobalAiUsage"."count" + 1, "updatedAt" = now()
    where "GlobalAiUsage"."count" < ${cap}
    returning "count"`;
  if (!rows.length) throw new BudgetExhaustedError(model);
}

export async function sharedUsageToday() {
  const day = pacificDay();
  if (isDemoMode()) return [];
  const rows = await getPrisma().globalAiUsage.findMany({ where: { day } });
  return rows.map((r) => ({ model: r.model, used: r.count, ...dailyBudget(r.model) }));
}
