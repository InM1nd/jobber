import { describe, expect, it } from 'vitest';
import { worthALook, type LookApp } from './attention';

const now = new Date(2026, 9, 28, 12, 0, 0);
const at = (days: number, hour = 10) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const iso = (days: number, hour = 10) => at(days, hour).toISOString();
const app = (patch: Partial<LookApp> & Pick<LookApp, 'id' | 'status'>): LookApp => ({
  company: 'Acme',
  role: 'Engineer',
  appliedAt: at(-3).toISOString(),
  ...patch,
});

describe('worth a look', () => {
  it('lists an interview today or tomorrow, and one that already happened while the card is still open', () => {
    const { rows } = worthALook([
      app({ id: 'soon', status: 'interview', notes: `(interview ${iso(1, 14)})` }),
      app({ id: 'today', status: 'on_hold', nextAction: 'Interview 2026-10-28 18:00' }),
      app({ id: 'past', status: 'on_hold', notes: `HR-интервью прошло (interview ${iso(-1, 10)})` }),
      app({ id: 'moved', status: 'rejected', notes: `(interview ${iso(-2, 10)})\nrejected after HR interview` }),
      app({ id: 'later', status: 'interview', notes: `(interview ${iso(5, 10)})` }),
    ], now);
    expect(rows.map((r) => [r.id, r.kind])).toEqual([
      ['today', 'soon'],
      ['soon', 'soon'],
      ['past', 'past'],
    ]);
    expect(rows[0].text).toBe('Interview today, 18:00');
    expect(rows[1].text).toBe('Interview tomorrow, 14:00');
    expect(rows[2].text).toMatch(/^Interview was .+ How did it go\?$/);
  });

  it('names applications with no reply for two weeks, and skips a prep note', () => {
    const quiet = Array.from({ length: 6 }, (_, i) => app({
      id: `q${i}`,
      status: 'applied',
      company: `Co ${i}`,
      appliedAt: at(-20 - i).toISOString(),
      notes: 'Sent the letter.',
    }));
    const { rows, quietMore } = worthALook([
      ...quiet,
      app({ id: 'fresh', status: 'applied', appliedAt: at(-3).toISOString() }),
      app({ id: 'prep', status: 'applied', appliedAt: at(-3).toISOString(), notes: 'На интервью спросить: runway.' }),
      app({ id: 'asked', status: 'applied', appliedAt: at(-20).toISOString(), notes: '[2026-10-10] Question: Notice period?' }),
    ], now);
    expect(rows.filter((r) => r.kind === 'quiet').map((r) => r.id)).toEqual(['q5', 'q4', 'q3', 'q2', 'q1']);
    expect(quietMore).toBe(1);
    expect(rows.find((r) => r.id === 'q5')?.text).toBe('No reply for 25 days');
    expect(rows.some((r) => r.id === 'prep' || r.id === 'asked' || r.id === 'fresh')).toBe(false);
  });

  it('reads the interview date on the card, and a shorter silence window', () => {
    const { rows } = worthALook([
      app({ id: 'field', status: 'applied', interviewAt: iso(1, 11) }),
      app({ id: 'week', status: 'applied', appliedAt: at(-8).toISOString(), notes: 'Sent the letter.' }),
    ], now, 5, 7);
    expect(rows.map((r) => [r.id, r.kind])).toEqual([['field', 'soon'], ['week', 'quiet']]);
    expect(worthALook([app({ id: 'week', status: 'applied', appliedAt: at(-8).toISOString() })], now).rows).toEqual([]);
  });
});
