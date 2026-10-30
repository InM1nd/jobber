import { describe, expect, it } from 'vitest';
import { funnel, notesAfterInterview } from './funnel';

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

  it('counts an interview that already happened after the card moved on', () => {
    const past = [
      { status: 'rejected', appliedAt: ago(12), notes: '20.10: invited to 1st interview\n27.10 HR-интервью прошло\n30.10: rejected after HR interview' },
      { status: 'on_hold', appliedAt: ago(8), notes: 'Confirmed 1st round (HR) on Tuesday.' },
      { status: 'rejected', appliedAt: ago(6), notes: '[2026-10-22] Interview held' },
      { status: 'rejected', appliedAt: ago(5), notes: 'Call confirmed (interview 2026-10-21T09:00:00+01:00)' },
      { status: 'rejected', appliedAt: ago(4), nextAction: 'Interview 2026-10-26 10:00' },
      { status: 'rejected', appliedAt: ago(3), notes: '30.10: template rejection via Ashby (no-reply).' },
      { status: 'applied', appliedAt: ago(2), notes: '300+ раундов, €32M+.' },
      { status: 'applied', appliedAt: ago(1), notes: 'На интервью спросить: runway и финансирование.' },
    ];
    expect(funnel(past, '30', now)).toMatchObject({ applied: 8, interviews: 5, interviewOpen: 1, interviewStopped: 4 });
  });

  it('counts a stored interview date, and uses the quiet-days setting for silence', () => {
    const dated = [
      { status: 'applied', appliedAt: ago(4), interviewAt: '2026-10-30T10:00:00Z' },
      { status: 'on_hold', appliedAt: ago(6), interviewAt: '2026-10-22T10:00:00Z' },
      { status: 'rejected', appliedAt: ago(9), interviewAt: '2026-10-20T10:00:00Z' },
      { status: 'applied', appliedAt: ago(8) },
      { status: 'applied', appliedAt: ago(20) },
    ];
    expect(funnel(dated, '30', now, 14)).toMatchObject({ interviews: 3, interviewOpen: 2, interviewStopped: 1, silent: 1 });
    expect(funnel(dated, '30', now, 7).silent).toBe(2);
  });

  it('writes a note when a card leaves Interview, and does not duplicate one', () => {
    expect(notesAfterInterview('interview', 'rejected', 'Spoke on Tuesday.', new Date('2026-10-30T12:00:00Z'))).toBe(
      'Spoke on Tuesday.\n[2026-10-30] Interview held',
    );
    expect(notesAfterInterview('interview', 'on_hold', '27.10 HR-интервью прошло')).toBeUndefined();
    expect(notesAfterInterview('interview', 'applied', null)).toBeUndefined();
    expect(notesAfterInterview('applied', 'rejected', null)).toBeUndefined();
    expect(notesAfterInterview('interview', 'rejected', 'Spoke on Tuesday.', new Date('2026-10-30T12:00:00Z'), '2026-10-29T10:00:00Z')).toBeUndefined();
  });

  it('charts 8 weeks with this week last', () => {
    const f = funnel(apps, 'all', now);
    expect(f.weeks).toHaveLength(8);
    expect(f.weeks[7].start).toBe('2026-10-26');
    expect(f.weeks.reduce((s, w) => s + w.count, 0)).toBe(6);
  });
});
