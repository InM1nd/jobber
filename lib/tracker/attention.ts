/**
 * "Worth a look": what to do today, independent of the funnel's 30/90/all filter.
 * Idea from AienTech/dossier (dashboard attention list), written for Jobber's tracker.
 * Interviews come from the notes and the next action, so one that already happened
 * still shows while the card sits in Interview or On hold.
 */

import { gotReply, reachedInterview, type FunnelApp } from '@/lib/tracker/funnel';

export const OPEN_APPLICATION = 'jobber-open-application';

export type LookApp = FunnelApp & { id: string; company: string; role: string };

export type LookKind = 'soon' | 'past' | 'quiet';

export interface LookItem {
  id: string;
  company: string;
  role: string;
  kind: LookKind;
  text: string;
}

const SOON_STATUS = new Set(['applied', 'interview', 'on_hold', 'offer']);
const OPEN = new Set(['interview', 'on_hold']);
const QUIET_STATUS = new Set(['applied', 'on_hold']);
const DAY = 864e5;

/** How long "no reply" waits. 14 is the default. */
export const QUIET_DAYS = [3, 5, 7, 10, 14, 21, 30] as const;

export function quietDaysOf(value: unknown): (typeof QUIET_DAYS)[number] {
  const n = Number(value);
  return (QUIET_DAYS as readonly number[]).includes(n) ? (n as (typeof QUIET_DAYS)[number]) : 14;
}

const TIME_IN_NOTES = /\(interview (\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)\)/g;
const NEXT_TIME = /^Interview (\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/;
const HELD = /\[(\d{4}-\d{2}-\d{2})\] Interview held\b/;
const HAPPENED = /интервью\s+прошл|HR-интервью|\[(\d{4}-\d{2}-\d{2})\] Interview held\b/i;

type Moment = { at: Date; clock: boolean };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function moments(app: LookApp): Moment[] {
  const found: Moment[] = [];
  if (app.interviewAt) {
    const at = new Date(app.interviewAt);
    if (!Number.isNaN(at.getTime())) found.push({ at, clock: true });
  }
  TIME_IN_NOTES.lastIndex = 0;
  for (const match of (app.notes || '').matchAll(TIME_IN_NOTES)) {
    const at = new Date(match[1]);
    if (!Number.isNaN(at.getTime())) found.push({ at, clock: true });
  }
  const next = (app.nextAction || '').match(NEXT_TIME);
  if (next) {
    const [year, month, day] = next[1].split('-').map(Number);
    const [hour, minute] = next[2].split(':').map(Number);
    found.push({ at: new Date(year, month - 1, day, hour, minute), clock: true });
  }
  const held = (app.notes || '').match(HELD);
  if (held) {
    const [year, month, day] = held[1].split('-').map(Number);
    found.push({ at: new Date(year, month - 1, day, 18, 0), clock: false });
  }
  return found;
}

const clock = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function soonText(at: Date, now: Date): string {
  const time = clock(at);
  if (dayKey(at) === dayKey(now)) return `Interview today, ${time}`;
  if (dayKey(at) === dayKey(addDays(now, 1))) return `Interview tomorrow, ${time}`;
  return `Interview ${dayLabel(at)}, ${time}`;
}

function pastText(moment: Moment | undefined): string {
  if (!moment) return 'The interview already happened. How did it go?';
  const when = moment.clock ? `${dayLabel(moment.at)}, ${clock(moment.at)}` : dayLabel(moment.at);
  return `Interview was ${when}. How did it go?`;
}

/** Today and tomorrow first, then interviews still waiting on a card, then the longest silences. */
export function worthALook(apps: LookApp[], now = new Date(), quietCap = 5, quietDays = 14): { rows: LookItem[]; quietMore: number } {
  const soon: Array<LookItem & { at: number }> = [];
  const past: Array<LookItem & { at: number }> = [];
  const quiet: Array<LookItem & { days: number }> = [];
  const today = dayKey(now);
  const tomorrow = dayKey(addDays(now, 1));

  for (const app of apps) {
    const times = moments(app);
    const upcoming = times
      .filter((m) => m.at.getTime() > now.getTime() && (dayKey(m.at) === today || dayKey(m.at) === tomorrow))
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    if (upcoming && SOON_STATUS.has(app.status)) {
      soon.push({ id: app.id, company: app.company, role: app.role, kind: 'soon', text: soonText(upcoming.at, now), at: upcoming.at.getTime() });
      continue;
    }

    const held = times.filter((m) => m.at.getTime() <= now.getTime()).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (OPEN.has(app.status) && (held || HAPPENED.test(app.notes || ''))) {
      past.push({ id: app.id, company: app.company, role: app.role, kind: 'past', text: pastText(held), at: held?.at.getTime() ?? 0 });
      continue;
    }

    const applied = Date.parse(app.appliedAt || '');
    if (!QUIET_STATUS.has(app.status) || !app.appliedAt || Number.isNaN(applied)) continue;
    if (gotReply(app) || reachedInterview(app)) continue;
    const days = Math.floor((now.getTime() - applied) / DAY);
    if (days >= quietDays) {
      quiet.push({ id: app.id, company: app.company, role: app.role, kind: 'quiet', text: `No reply for ${days} days`, days });
    }
  }

  soon.sort((a, b) => a.at - b.at);
  past.sort((a, b) => b.at - a.at);
  quiet.sort((a, b) => b.days - a.days);
  const rows = [...soon, ...past, ...quiet.slice(0, quietCap)].map(({ id, company, role, kind, text }) => ({ id, company, role, kind, text }));
  return { rows, quietMore: Math.max(0, quiet.length - quietCap) };
}
