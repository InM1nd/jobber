/**
 * The job-search funnel, worked out in code from the tracker: applied → replied →
 * interview → offer, with rates and a week-by-week chart. Idea from AienTech/dossier
 * (dashboard), written for Jobber.
 */

export type Period = '30' | '90' | 'all';

export interface FunnelApp {
  status: string;
  appliedAt?: string | null;
  createdAt?: string | null;
  notes?: string | null;
}

export interface Funnel {
  applied: number;
  replied: number;
  interviews: number;
  offers: number;
  rejected: number;
  /** Applied more than 14 days ago and nothing back yet. */
  silent: number;
  replyRate: number | null;
  interviewRate: number | null;
  /** Applications sent per week, oldest first (8 weeks). */
  weeks: Array<{ start: string; count: number }>;
}

const SENT = new Set(['applied', 'interview', 'on_hold', 'offer', 'rejected']);
/** Reply lines written by "Got a reply?" / the bot: "[2026-10-28] Interview invite: …". */
const REPLY_NOTE = /\[\d{4}-\d{2}-\d{2}\] (Rejection|Interview invite|Question|Offer)\b/;
const INTERVIEW_NOTE = /\[\d{4}-\d{2}-\d{2}\] (Interview invite|Offer)\b/;

const DAY = 864e5;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

function mondayOf(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

export function funnel(apps: FunnelApp[], period: Period, now = new Date()): Funnel {
  const from = period === 'all' ? 0 : now.getTime() - Number(period) * DAY;
  const sent = apps.filter((a) => {
    if (!SENT.has(a.status)) return false;
    const at = Date.parse(a.appliedAt || a.createdAt || '');
    return Number.isNaN(at) ? period === 'all' : at >= from;
  });
  const replied = sent.filter((a) => ['interview', 'offer', 'rejected'].includes(a.status) || REPLY_NOTE.test(a.notes || ''));
  const interviews = sent.filter((a) => a.status === 'interview' || a.status === 'offer' || INTERVIEW_NOTE.test(a.notes || ''));
  const offers = sent.filter((a) => a.status === 'offer');
  const silent = sent.filter((a) => !replied.includes(a) && Date.parse(a.appliedAt || '') < now.getTime() - 14 * DAY);

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
    offers: offers.length,
    rejected: sent.filter((a) => a.status === 'rejected').length,
    silent: silent.length,
    replyRate: pct(replied.length, sent.length),
    interviewRate: pct(interviews.length, sent.length),
    weeks,
  };
}
