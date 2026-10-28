import { getPrisma } from '@/lib/db/prisma';
import { getMatch, saveCoverLetter } from '@/lib/data/service';
import { getGeminiKey } from '@/lib/data/keys';
import { generateCoverLetter, letterUnverified } from '@/lib/llm/matcher';
import { userChatClient } from '@/lib/ai/shared-client';
import { stamp } from '@/lib/ai/meta';
import { letterInputs } from '@/lib/apply/letter-inputs';
import { notTracked } from '@/lib/tracker/link';
import { sendTelegramMessage } from '@/lib/telegram/bot';
import { BudgetExhaustedError } from '@/lib/ai/budget';
import { QuotaExceededError } from '@/lib/ai/quota';
import { AiUnavailableError } from '@/lib/ai/gemini';

/**
 * The agent's drafts: after the daily scoring, it writes cover letters for the best new
 * matches so they wait ready for review. It never sends or applies; the user reads the
 * letter (fact-checked, with versions) and decides. Idea from AienTech/dossier (agent drafts).
 *
 * Who gets them: the owner (unless AGENT_DRAFTS=off), and users with their own Gemini key
 * when AGENT_DRAFTS_ALL=true. AGENT_DRAFTS_PER_DAY (default 3) and AGENT_DRAFTS_MIN_SCORE
 * (default 75, or the user's alert threshold when higher).
 */

export const PER_DAY = () => Math.max(0, Number(process.env.AGENT_DRAFTS_PER_DAY || 3));
export const MIN_SCORE = () => Number(process.env.AGENT_DRAFTS_MIN_SCORE || 75);

export interface DraftCandidate { id: string; score: number; title: string; company: string }

/** Which matches get a draft: best first, at most `limit`. Pure, for tests. */
export function pickForDrafts(rows: DraftCandidate[], limit: number): DraftCandidate[] {
  return [...rows].sort((a, b) => b.score - a.score).slice(0, limit);
}

export function draftsMessage(done: DraftCandidate[], base: string): string {
  const lines = done.map((d) => `• ${d.title} at ${d.company} · ${d.score}${base ? `\n  ${new URL(`/dashboard/matches/${d.id}`, base).toString()}` : ''}`);
  return `${done.length === 1 ? 'A cover letter is' : `${done.length} cover letters are`} ready for review\n\n${lines.join('\n\n')}\n\nNothing was sent. Check the “Check before sending” notes, edit, then apply yourself.`;
}

async function eligibleUsers() {
  const prisma = getPrisma();
  const owner = process.env.OWNER_TELEGRAM_ID?.trim();
  const ids: Array<{ id: string; telegramId: string | null }> = [];
  if (owner && process.env.AGENT_DRAFTS !== 'off') {
    const u = await prisma.user.findUnique({ where: { telegramId: owner }, select: { id: true, telegramId: true } });
    if (u) ids.push(u);
  }
  if (process.env.AGENT_DRAFTS_ALL === 'true') {
    const withKeys = await prisma.user.findMany({ where: { apiKeys: { some: { provider: 'gemini' } } }, select: { id: true, telegramId: true }, take: 50 });
    for (const u of withKeys) if (!ids.some((x) => x.id === u.id) && (await getGeminiKey(u.id))) ids.push(u);
  }
  return ids;
}

/** Writes today's drafts for one user. Returns the matches it wrote letters for. */
export async function draftForUser(userId: string, opts: { limit: number; deadline: number }): Promise<DraftCandidate[]> {
  const prisma = getPrisma();
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { alertThreshold: true, cvText: true } });
  if (!profile) return [];
  const since = new Date(Date.now() - 3 * 864e5);
  const rows = await prisma.jobMatch.findMany({
    where: { userId, filtered: false, coverLetter: null, score: { gte: Math.max(MIN_SCORE(), profile.alertThreshold ?? 0) }, createdAt: { gte: since }, ...notTracked(userId) },
    orderBy: { score: 'desc' },
    take: 10,
    select: { id: true, score: true, job: { select: { title: true, company: true, source: { select: { company: true } } } } },
  });
  const picked = pickForDrafts(rows.map((r) => ({ id: r.id, score: r.score, title: r.job.title, company: r.job.company || r.job.source.company })), opts.limit);
  const done: DraftCandidate[] = [];
  for (const c of picked) {
    if (Date.now() > opts.deadline) break;
    const match = await getMatch(userId, c.id);
    if (!match || match.coverLetter) continue;
    try {
      const { profileInput, jobInput } = await letterInputs(userId, match);
      if (!profileInput.cvText) break; // no CV, no letter
      const letter = await generateCoverLetter(userChatClient(userId, 'write', 'smart', 20_000), profileInput, jobInput);
      await saveCoverLetter(userId, c.id, letter, stamp('letter', letterUnverified(letter, profileInput, jobInput), { cause: 'agent' }));
      done.push(c);
    } catch (error) {
      if (error instanceof QuotaExceededError || error instanceof BudgetExhaustedError || error instanceof AiUnavailableError) break;
      console.error('agent draft failed', c.id, error instanceof Error ? error.message : error);
    }
  }
  return done;
}

/** One run for everyone eligible; tells each user on Telegram what's waiting. */
export async function runAgentDrafts(deadline: number) {
  const limit = PER_DAY();
  if (!limit) return { users: 0, drafted: 0 };
  const base = process.env.NEXT_PUBLIC_APP_URL || '';
  let drafted = 0;
  const users = await eligibleUsers();
  for (const u of users) {
    if (Date.now() > deadline) break;
    const done = await draftForUser(u.id, { limit, deadline });
    drafted += done.length;
    if (done.length && u.telegramId) await sendTelegramMessage(u.telegramId, draftsMessage(done, base));
  }
  return { users: users.length, drafted };
}
