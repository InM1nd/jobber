/**
 * Interviews to the calendar without any OAuth: a Google Calendar "add event" link and an
 * .ics file (Apple Calendar, Outlook). The time comes from the reply Jobber read
 * ("(interview 2026-11-04T14:00:00+01:00)" in the application's notes).
 */

export interface InterviewEvent {
  title: string;
  start: Date;
  minutes?: number;
  details?: string;
  location?: string;
}

/** The latest interview time noted on an application, or null. */
export function latestInterview(notes: string | null | undefined): Date | null {
  const all = [...(notes || '').matchAll(/\(interview (\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)\)/g)];
  for (let i = all.length - 1; i >= 0; i--) {
    const d = new Date(all[i][1]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

const stampUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleCalendarUrl(e: InterviewEvent): string {
  const end = new Date(e.start.getTime() + (e.minutes ?? 45) * 60_000);
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE');
  u.searchParams.set('text', e.title);
  u.searchParams.set('dates', `${stampUtc(e.start)}/${stampUtc(end)}`);
  if (e.details) u.searchParams.set('details', e.details.slice(0, 900));
  if (e.location) u.searchParams.set('location', e.location);
  return u.toString();
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** RFC 5545 lines are folded at 75 octets. */
const fold = (line: string) => line.match(/.{1,73}/g)!.join('\r\n ');

export function icsFor(e: InterviewEvent, uid: string, now = new Date()): string {
  const end = new Date(e.start.getTime() + (e.minutes ?? 45) * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Jobber//Interview//EN',
    'BEGIN:VEVENT',
    `UID:${uid}@jobber`,
    `DTSTAMP:${stampUtc(now)}`,
    `DTSTART:${stampUtc(e.start)}`,
    `DTEND:${stampUtc(end)}`,
    fold(`SUMMARY:${esc(e.title)}`),
    ...(e.details ? [fold(`DESCRIPTION:${esc(e.details)}`)] : []),
    ...(e.location ? [fold(`LOCATION:${esc(e.location)}`)] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Interview in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export const interviewTitle = (company: string, role: string) => `Interview: ${role} at ${company}`.slice(0, 140);
