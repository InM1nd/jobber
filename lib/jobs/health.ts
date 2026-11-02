import { getPrisma } from '@/lib/db/prisma';
import { sendTelegramMessage } from '@/lib/telegram/bot';

/** Weekly note to the owner about sources that quietly stopped bringing jobs. */

export interface SourceHealth {
  company: string;
  sourceType: string;
  problem: string;
}

const DAY = 24 * 3600 * 1000;

/** Pure: which sources look broken. Agent and manual sources are never fetched, so they're skipped. */
export function unhealthy(
  sources: Array<{ id: string; company: string; sourceType: string; lastError: string | null; lastSuccessAt: Date | null; createdAt: Date }>,
  openJobs: Map<string, number>,
  now = Date.now(),
): SourceHealth[] {
  const out: SourceHealth[] = [];
  for (const s of sources) {
    if (s.sourceType === 'manual' || s.sourceType === 'agent') continue;
    if (now - s.createdAt.getTime() < 3 * DAY) continue; // too new to judge
    if (s.lastError) out.push({ company: s.company, sourceType: s.sourceType, problem: `fails: ${s.lastError.slice(0, 80)}` });
    else if (!s.lastSuccessAt || now - s.lastSuccessAt.getTime() > 7 * DAY) out.push({ company: s.company, sourceType: s.sourceType, problem: 'no successful fetch for 7+ days' });
    else if (!openJobs.get(s.id)) out.push({ company: s.company, sourceType: s.sourceType, problem: 'no open jobs' });
  }
  return out;
}

/** Sends the report to the owner (sources used by any profile only). Returns how many were flagged. */
export async function sendSourceHealth(): Promise<number> {
  const prisma = getPrisma();
  const tg = process.env.OWNER_TELEGRAM_ID?.trim();
  if (!tg) return 0;
  const used = new Set((await prisma.profile.findMany({ select: { sourceIds: true } })).flatMap((p) => p.sourceIds));
  const sources = await prisma.jobSource.findMany({
    where: { isActive: true, id: { in: [...used] } },
    select: { id: true, company: true, sourceType: true, lastError: true, lastSuccessAt: true, createdAt: true },
  });
  const counts = await prisma.job.groupBy({ by: ['sourceId'], where: { isActive: true, sourceId: { in: sources.map((s) => s.id) } }, _count: { _all: true } });
  const bad = unhealthy(sources, new Map(counts.map((c) => [c.sourceId, c._count._all])));
  if (!bad.length) return 0;
  const lines = bad.slice(0, 25).map((b) => `• ${b.company} (${b.sourceType}) — ${b.problem}`);
  await sendTelegramMessage(
    tg,
    `Weekly source check: ${bad.length} of ${sources.length} sources need a look.\n\n${lines.join('\n')}${bad.length > 25 ? `\n…and ${bad.length - 25} more` : ''}\n\nFix or remove them in Profile → Companies to watch.`,
  );
  return bad.length;
}
