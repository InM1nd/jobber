'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { OPEN_APPLICATION, QUIET_DAYS, quietDaysOf, worthALook, type LookApp } from '@/lib/tracker/attention';
import { funnel, type Period } from '@/lib/tracker/funnel';

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: 'all', label: 'All' },
];

function Step({ label, value, of, hint, note }: { label: string; value: number; of: number; hint?: string; note?: string }) {
  const width = of ? Math.max(4, Math.round((value / of) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums"><span className="font-semibold text-fg">{value}</span>{hint ? <span className="ml-1.5 text-[11.5px] text-subtle">{hint}</span> : null}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${width}%` }} />
      </div>
      {note ? <p className="text-[11.5px] text-subtle">{note}</p> : null}
    </div>
  );
}

/** Applied → replied → interview → offer, from the tracker, plus a week-by-week chart. */
export function FunnelCard({ applications, quietDays = 14 }: { applications: LookApp[]; quietDays?: number }) {
  const [period, setPeriod] = useState<Period>('30');
  const [days, setDays] = useState(quietDaysOf(quietDays));
  useEffect(() => { setDays(quietDaysOf(quietDays)); }, [quietDays]);
  const f = useMemo(() => funnel(applications, period, new Date(), days), [applications, period, days]);
  const look = useMemo(() => worthALook(applications, new Date(), 5, days), [applications, days]);
  const interviewNote = f.interviewStopped > 0 || (f.interviews > 0 && f.interviewOpen !== f.interviews)
    ? `${f.interviewOpen} still waiting${f.interviewStopped ? ` · ${f.interviewStopped} rejected after` : ''}`
    : undefined;

  async function chooseQuiet(next: number) {
    const value = quietDaysOf(next);
    const prev = days;
    setDays(value);
    const res = await fetch('/api/profile/quiet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quietDays: value }),
    });
    if (!res.ok) setDays(prev);
  }
  const peak = Math.max(1, ...f.weeks.map((w) => w.count));
  if (!applications.some((a) => a.appliedAt)) return null;

  return (
    <section className="mb-6 grid gap-5 rounded-[var(--radius-card)] border border-line p-5 md:grid-cols-[1.3fr_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[14px] font-medium">Your funnel</p>
          <div className="flex rounded-full bg-surface-2 p-0.5 text-[12px]">
            {PERIODS.map((p) => (
              <button key={p.key} type="button" onClick={() => setPeriod(p.key)} className={cn('rounded-full px-2.5 py-1 transition-colors', period === p.key ? 'bg-bg font-medium text-fg shadow-sm' : 'text-muted')}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <Step label="Applied" value={f.applied} of={f.applied} />
        <Step label="Got a reply" value={f.replied} of={f.applied} hint={f.replyRate != null ? `${f.replyRate}%` : undefined} />
        <Step label="Interview" value={f.interviews} of={f.applied} hint={f.interviewRate != null ? `${f.interviewRate}%` : undefined} note={interviewNote} />
        <Step label="Offer" value={f.offers} of={f.applied} />
        {f.silent > 0 && <p className="text-[12px] text-subtle">{f.silent} without any answer after {days} days — worth a follow-up or letting go.</p>}
        <label className="flex items-center justify-between gap-2 pt-1 text-[12px] text-muted">
          No reply after
          <select
            aria-label="No reply after"
            value={days}
            onChange={(e) => void chooseQuiet(Number(e.target.value))}
            className="h-8 rounded-full border border-line bg-bg px-2.5 text-[12.5px] text-fg"
          >
            {QUIET_DAYS.map((n) => <option key={n} value={n}>{n} days</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-col">
        <p className="mb-3 text-[12.5px] text-muted">Applications per week</p>
        <div className="flex flex-1 items-end gap-1.5" style={{ minHeight: 96 }}>
          {f.weeks.map((w, i) => (
            <div key={w.start} className="flex flex-1 flex-col items-center gap-1" title={`Week of ${w.start}: ${w.count}`}>
              <span className="text-[10.5px] tabular-nums text-subtle">{w.count || ''}</span>
              <div className={cn('w-full rounded-t-[4px]', i === f.weeks.length - 1 ? 'bg-accent' : 'bg-accent/45')} style={{ height: `${Math.round((w.count / peak) * 72) + 2}px` }} />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] text-subtle">
          <span>{f.weeks[0]?.start.slice(5).replace('-', '.')}</span>
          <span>this week</span>
        </div>
      </div>
      {look.rows.length > 0 && (
        <div className="border-t border-line pt-4 md:col-span-2">
          <p className="mb-2 text-[14px] font-medium">Worth a look</p>
          <ul className="divide-y divide-line">
            {look.rows.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent(OPEN_APPLICATION, { detail: item.id }))}
                  className="flex w-full flex-col items-start gap-0.5 py-2 text-left transition-colors hover:bg-surface-2/70"
                >
                  <span className="text-[13.5px] font-medium leading-tight">{item.role} <span className="font-normal text-muted">· {item.company}</span></span>
                  <span className={cn('text-[12.5px]', item.kind === 'quiet' ? 'text-subtle' : 'text-fg')}>{item.text}</span>
                </button>
              </li>
            ))}
          </ul>
          {look.quietMore > 0 && <p className="pt-1 text-[12px] text-subtle">and {look.quietMore} more with no reply</p>}
        </div>
      )}
    </section>
  );
}
