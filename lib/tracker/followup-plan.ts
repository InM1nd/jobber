
export const FOLLOWED_UP = /^(\d{2}\.\d{2}(?:\.\d{4})?): Followed up/m;
const DAY = 86400000;

export interface FollowUpPlan {
  active: boolean;
  count: number;
  stage: string;
  due: string | null;
  overdue: boolean;
  timeline: string[];
  channels: Array<{ label: string; detail: string }>;
}

/** When and how to follow up. Pure: derived from the application only. */
export function followUpPlan(app: { status: string; appliedAt: string | null; followUpAt: string | null; notes: string | null; contact: string | null; url: string | null }, now = new Date()): FollowUpPlan {
  const count = (app.notes || '').split('\n').filter((l) => FOLLOWED_UP.test(l)).length;
  const active = ['applied', 'on_hold'].includes(app.status);
  const applied = app.appliedAt ? new Date(app.appliedAt) : null;
  const due = app.followUpAt ? new Date(app.followUpAt) : applied ? new Date(applied.getTime() + (count === 0 ? 7 : 14) * DAY) : null;
  const stage =
    !active ? 'No follow-up needed for this status.'
    : count === 0 ? 'First follow-up: about 7 days after applying, if there is no reply.'
    : count === 1 ? 'Second (last) follow-up: about 14 days after applying.'
    : 'You have followed up twice. Leave it now; move it to On hold if there is no reply after 3 weeks.';
  const timeline = applied
    ? [`Applied ${fmt(applied)}`, `Day 7 · ${fmt(new Date(applied.getTime() + 7 * DAY))}: short check-in`, `Day 14 · ${fmt(new Date(applied.getTime() + 14 * DAY))}: last nudge`, `Day 21+: On hold`]
    : [];
  const email = app.contact?.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  const channels = [
    email
      ? { label: 'Email thread', detail: `Reply in your application thread with ${email}, so they see the context.` }
      : { label: 'Email thread', detail: 'Reply to the application confirmation email, if you got one. Keep the same subject line.' },
    { label: 'LinkedIn', detail: 'Connect with the recruiter or hiring manager. Plain connect without a note (no Premium needed). Message only after they accept.' },
    { label: 'Careers contact', detail: app.url ? 'Use the jobs/careers email from the listing or careers page if there is no recruiter.' : 'Use the jobs/careers email from their careers page.' },
  ];
  return { active, count, stage, due: due ? due.toISOString() : null, overdue: Boolean(active && due && due.getTime() < now.getTime()), timeline, channels };
}

function fmt(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

