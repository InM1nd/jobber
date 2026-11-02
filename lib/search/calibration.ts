import { getPrisma } from '@/lib/db/prisma';
import { skipReasonOf, withSkipReason } from '@/lib/tracker/skip';
import { parseAiMeta } from '@/lib/ai/meta';
import { USER_SKIP_FLAG } from './flags';

/**
 * Personal calibration: the candidate's own recent decisions in the tracker — what they
 * applied to (and got interviews for) and what they skipped — shown to the scorer as
 * examples, so "fits" means fits *this* person, not a generic profile. Titles and
 * companies only (short, no notes), at most a few of each.
 */

export interface Decision {
  kind: 'interview' | 'applied' | 'skipped';
  title: string;
  company: string;
  /** Why it was skipped (lib/tracker/skip.ts), when the candidate said. */
  reason?: string;
}

const KIND: Record<string, Decision['kind']> = { interview: 'interview', offer: 'interview', applied: 'applied', on_hold: 'applied', skip: 'skipped' };
const LABEL: Record<Decision['kind'], string> = { interview: 'got an interview', applied: 'applied', skipped: 'skipped (not interested)' };

export function decisionsFrom(rows: Array<{ status: string; role: string; company: string; notes?: string | null }>, max = { interview: 3, applied: 4, skipped: 5 }): Decision[] {
  const out: Decision[] = [];
  const count = { interview: 0, applied: 0, skipped: 0 };
  // Skips with a stated reason teach more than bare ones: take those first.
  const ordered = [...rows].sort((a, b) => Number(Boolean(skipReasonOf(b.notes))) - Number(Boolean(skipReasonOf(a.notes))));
  for (const r of ordered) {
    const kind = KIND[r.status];
    if (!kind || count[kind] >= max[kind]) continue;
    count[kind]++;
    const reason = kind === 'skipped' ? skipReasonOf(r.notes) : null;
    out.push({ kind, title: r.role.slice(0, 80), company: r.company.slice(0, 60), ...(reason ? { reason } : {}) });
  }
  return out;
}

/** The prompt block, or "" when there's nothing to learn from yet. */
export function calibrationBlock(decisions: Decision[]): string {
  if (decisions.length < 2) return '';
  return `CANDIDATE'S OWN RECENT DECISIONS (calibrate roleFit to them; don't copy scores, judge each job on its text)
${decisions.map((d) => `- ${LABEL[d.kind]}${d.reason ? ` because of ${d.reason.toLowerCase()}` : ''}: ${d.title} — ${d.company}`).join('\n')}
`;
}

export async function loadDecisions(userId: string): Promise<Decision[]> {
  const prisma = getPrisma();
  const [rows, swiped] = await Promise.all([
    prisma.application.findMany({
      where: { userId, status: { in: Object.keys(KIND) } },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: { status: true, role: true, company: true, notes: true },
    }),
    // "Not for me" swipes in Review count as skips, with their reason.
    prisma.jobMatch.findMany({
      where: { userId, filtered: true, redFlags: { has: USER_SKIP_FLAG } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { aiMeta: true, job: { select: { title: true, company: true, source: { select: { company: true } } } } },
    }),
  ]);
  const skips = swiped.map((m) => {
    const reason = parseAiMeta(m.aiMeta).swipe?.reason;
    return { status: 'skip', role: m.job.title, company: m.job.company || m.job.source.company, notes: reason ? withSkipReason(null, reason) : null };
  });
  return decisionsFrom([...rows, ...skips]);
}
