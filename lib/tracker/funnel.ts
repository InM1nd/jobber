/**
 * The job-search funnel, worked out in code from the tracker: applied → replied →
 * interview → offer, with rates and a week-by-week chart. Idea from AienTech/dossier
 * (dashboard), written for Jobber.
 *
 * Stages are facts reached, not the column the card sits in now. An interview still
 * counts after it happened and the card moved to On hold, Rejected or Offer — the
 * notes ("invited to 1st interview", "HR-интервью прошло", a dated Interview line)
 * and the interview date on the card are the record. The Interview column is only
 * the ones still waiting.
 */

export type Period = '30' | '90' | 'all';

export interface FunnelApp {
  status: string;
  appliedAt?: string | null;
  createdAt?: string | null;
  notes?: string | null;
  nextAction?: string | null;
  interviewAt?: string | null;
}

export interface Funnel {
  applied: number;
  replied: number;
  interviews: number;
  /** Reached an interview and the card is still open (Applied, Interview, or On hold). */
  interviewOpen: number;
  /** Reached an interview and the card is now Rejected. */
  interviewStopped: number;
  offers: number;
  rejected: number;
  /** Applied longer ago than the quiet-days setting, and nothing back yet. */
  silent: number;
  replyRate: number | null;
  interviewRate: number | null;
  /** Applications sent per week, oldest first (8 weeks). */
  weeks: Array<{ start: string; count: number }>;
}

const SENT = new Set(['applied', 'interview', 'on_hold', 'offer', 'rejected']);
/** Statuses that mean the interview already happened and the card moved on. */
const AFTER_INTERVIEW = new Set(['on_hold', 'rejected', 'offer']);
/** Reply lines written by "Got a reply?" / the bot: "[2026-10-28] Interview invite: …". */
const REPLY_NOTE = /\[\d{4}-\d{2}-\d{2}\] (Rejection|Interview invite|Interview held|Question|Offer)\b/;
const INTERVIEW_NOTE = /\[\d{4}-\d{2}-\d{2}\] (Interview invite|Interview held|Offer)\b/;
const INTERVIEW_TIME = /\(interview \d{4}-\d{2}-\d{2}T/;
/** Next action written when a reply settles an interview: "Interview 2026-10-27 10:00". */
const INTERVIEW_NEXT = /^Interview \d{4}-\d{2}-\d{2}/;
/**
 * Interviews written in ordinary notes, after the card has left the Interview column.
 * A prep line ("на интервью спросить") is not one: it has to be an invite, a round, or an interview that already took place.
 */
const INTERVIEW_PROSE = /\binvited to\b[^.\n]{0,80}\binterview\b|\b(?:1st|2nd|3rd|first|second|third|final)\s+(?:interview|round)\b|\bafter\b[^.\n]{0,40}\binterview\b|интервью\s+прошл|HR-интервью|собеседован\w*\s+(?:прошл|состоял)/i;

const DAY = 864e5;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

/** A reply landed: the card moved, the notes record one, or an interview date is set. */
export function gotReply(app: Pick<FunnelApp, 'status' | 'notes' | 'nextAction' | 'interviewAt'>): boolean {
  return ['interview', 'offer', 'rejected'].includes(app.status) || REPLY_NOTE.test(app.notes || '') || reachedInterview(app);
}

/** True when this application reached an interview, including one that already happened. */
export function reachedInterview(app: Pick<FunnelApp, 'status' | 'notes' | 'nextAction' | 'interviewAt'>): boolean {
  if (app.interviewAt && !Number.isNaN(Date.parse(app.interviewAt))) return true;
  if (app.status === 'interview' || app.status === 'offer') return true;
  const notes = app.notes || '';
  return INTERVIEW_NOTE.test(notes) || INTERVIEW_TIME.test(notes) || INTERVIEW_PROSE.test(notes) || INTERVIEW_NEXT.test(app.nextAction || '');
}

/**
 * When a card leaves Interview for On hold, Rejected or Offer, keep a dated line
 * unless the notes already say an interview happened. Returns undefined when the
 * notes should be left as they are.
 */
export function notesAfterInterview(prevStatus: string, nextStatus: string, notes: string | null | undefined, now = new Date(), interviewAt?: string | null): string | undefined {
  if (prevStatus !== 'interview' || prevStatus === nextStatus || !AFTER_INTERVIEW.has(nextStatus)) return undefined;
  if (reachedInterview({ status: 'applied', notes, interviewAt })) return undefined;
  const line = `[${now.toISOString().slice(0, 10)}] Interview held`;
  return [notes?.trim(), line].filter(Boolean).join('\n').slice(0, 8000);
}

function mondayOf(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

export function funnel(apps: FunnelApp[], period: Period, now = new Date(), quietDays = 14): Funnel {
  const from = period === 'all' ? 0 : now.getTime() - Number(period) * DAY;
  const sent = apps.filter((a) => {
    if (!SENT.has(a.status)) return false;
    const at = Date.parse(a.appliedAt || a.createdAt || '');
    return Number.isNaN(at) ? period === 'all' : at >= from;
  });
  const replied = sent.filter((a) => gotReply(a));
  const interviews = sent.filter((a) => reachedInterview(a));
  const offers = sent.filter((a) => a.status === 'offer');
  const silent = sent.filter((a) => !replied.includes(a) && Date.parse(a.appliedAt || '') < now.getTime() - quietDays * DAY);

  const thisWeek = mondayOf(now);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(thisWeek.getTime() - (7 - i) * 7 * DAY);
    const end = start.getTime() + 7 * DAY;
    const count = apps.filter((a) => {
      if (!SENT.has(a.status)) return false;
      const at = Date.parse(a.appliedAt || '');
      return at >= start.getTime() && at < end;
    }).length;
    return { start: start.toISOString().slice(0, 10), count };
  });

  return {
    applied: sent.length,
    replied: replied.length,
    interviews: interviews.length,
    interviewOpen: interviews.filter((a) => a.status === 'applied' || a.status === 'interview' || a.status === 'on_hold').length,
    interviewStopped: interviews.filter((a) => a.status === 'rejected').length,
    offers: offers.length,
    rejected: sent.filter((a) => a.status === 'rejected').length,
    silent: silent.length,
    replyRate: pct(replied.length, sent.length),
    interviewRate: pct(interviews.length, sent.length),
    weeks,
  };
}
