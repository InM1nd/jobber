import { getPrisma } from '@/lib/db/prisma';

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
}

const KIND: Record<string, Decision['kind']> = { interview: 'interview', offer: 'interview', applied: 'applied', on_hold: 'applied', skip: 'skipped' };
const LABEL: Record<Decision['kind'], string> = { interview: 'got an interview', applied: 'applied', skipped: 'skipped (not interested)' };

export function decisionsFrom(rows: Array<{ status: string; role: string; company: string }>, max = { interview: 3, applied: 4, skipped: 4 }): Decision[] {
  const out: Decision[] = [];
  const count = { interview: 0, applied: 0, skipped: 0 };
  for (const r of rows) {
    const kind = KIND[r.status];
    if (!kind || count[kind] >= max[kind]) continue;
    count[kind]++;
    out.push({ kind, title: r.role.slice(0, 80), company: r.company.slice(0, 60) });
  }
  return out;
}

/** The prompt block, or "" when there's nothing to learn from yet. */
export function calibrationBlock(decisions: Decision[]): string {
  if (decisions.length < 2) return '';
  return `CANDIDATE'S OWN RECENT DECISIONS (calibrate roleFit to them; don't copy scores, judge each job on its text)
${decisions.map((d) => `- ${LABEL[d.kind]}: ${d.title} — ${d.company}`).join('\n')}
`;
}

export async function loadDecisions(userId: string): Promise<Decision[]> {
  const rows = await getPrisma().application.findMany({
    where: { userId, status: { in: Object.keys(KIND) } },
    orderBy: { updatedAt: 'desc' },
    take: 40,
    select: { status: true, role: true, company: true },
  });
  return decisionsFrom(rows);
}
