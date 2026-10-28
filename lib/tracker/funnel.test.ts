import { describe, expect, it } from 'vitest';
import { funnel } from './funnel';

const now = new Date('2026-10-28T12:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * 864e5).toISOString();

describe('funnel', () => {
  const apps = [
    { status: 'applied', appliedAt: ago(3) },
    { status: 'applied', appliedAt: ago(20), notes: '[2026-10-20] Question: Asks for notice period.' },
    { status: 'interview', appliedAt: ago(10) },
    { status: 'offer', appliedAt: ago(40) },
    { status: 'rejected', appliedAt: ago(25) },
    { status: 'applied', appliedAt: ago(16) },
    { status: 'to_apply', appliedAt: null },
    { status: 'skip', appliedAt: ago(2) },
  ];

  it('counts the last 30 days', () => {
    const f = funnel(apps, '30', now);
    expect(f).toMatchObject({ applied: 5, replied: 3, interviews: 1, offers: 0, rejected: 1, silent: 1, replyRate: 60, interviewRate: 20 });
  });

  it('counts everything for “all”', () => {
    expect(funnel(apps, 'all', now)).toMatchObject({ applied: 6, offers: 1, interviews: 2 });
  });

  it('charts 8 weeks with this week last', () => {
    const f = funnel(apps, 'all', now);
    expect(f.weeks).toHaveLength(8);
    expect(f.weeks[7].start).toBe('2026-10-26');
    expect(f.weeks.reduce((s, w) => s + w.count, 0)).toBe(6);
  });
});
