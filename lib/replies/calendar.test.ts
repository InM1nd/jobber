import { describe, expect, it } from 'vitest';
import { googleCalendarUrl, icsFor, latestInterview } from './calendar';
import { noteLine } from './classify';

describe('interview to calendar', () => {
  const start = new Date('2026-11-04T14:00:00+01:00');
  it('finds the latest interview time in the notes the reply reader writes', () => {
    const notes = [
      noteLine({ kind: 'interview', summary: 'First call.', interviewAt: '2026-11-01T10:00:00+01:00' }, new Date('2026-10-28')),
      'Some note',
      noteLine({ kind: 'interview', summary: 'Second round.', interviewAt: '2026-11-04T14:00:00+01:00' }, new Date('2026-10-30')),
    ].join('\n');
    expect(latestInterview(notes)?.toISOString()).toBe('2026-11-04T13:00:00.000Z');
    expect(latestInterview('no times here')).toBeNull();
  });
  it('builds a Google Calendar link in UTC with a 45-minute slot', () => {
    const u = new URL(googleCalendarUrl({ title: 'Interview: FE at Acme', start }));
    expect(u.searchParams.get('dates')).toBe('20261104T130000Z/20261104T134500Z');
    expect(u.searchParams.get('text')).toBe('Interview: FE at Acme');
  });
  it('writes a valid .ics with an alarm and escaped text', () => {
    const ics = icsFor({ title: 'Interview: FE, Vienna; hybrid', start }, 'app1', new Date('2026-10-28T10:00:00Z'));
    expect(ics).toContain('DTSTART:20261104T130000Z');
    expect(ics).toContain('SUMMARY:Interview: FE\\, Vienna\; hybrid');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});
