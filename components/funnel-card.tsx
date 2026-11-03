'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OPEN_APPLICATION, QUIET_DAYS, quietDaysOf, worthALook, type LookApp } from '@/lib/tracker/attention';
import { funnel, type Period } from '@/lib/tracker/funnel';

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: 'all', label: 'All' },
];
const OPEN_KEY = 'jobber:funnel-open';
/** "Needs you" rows before "Show more": interviews first, then the oldest silences. */
const NEEDS_SHOWN = 4;
const NEEDS_SHOWN_PHONE = 2;

function Step({ label, value, of, hint, note }: { label: string; value: number; of: number; hint?: string; note?: string }) {
  const width = of ? Math.max(4, Math.round((value / of) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums"><span className="font-semibold text-fg">{value}</span>{hint ? <span className="ml-1.5 text-[13px] text-muted">{hint}</span> : null}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${width}%` }} />
      </div>
      {note ? <p className="text-[13px] text-muted">{note}</p> : null}
    </div>
  );
}

function Stat({ value, label, tone }: { value: React.ReactNode; label: string; tone?: 'accent' }) {
  return (
    <div className="min-w-0">
      <p className={cn('text-[19px] font-semibold leading-none tracking-[-0.03em] tabular-nums md:text-[22px]', tone === 'accent' && 'text-accent')}>{value}</p>
      <p className="mt-1 text-[12.5px] leading-tight text-muted md:truncate md:text-[13px]">{label}</p>
    </div>
  );
}

/**
 * Top of the tracker: the numbers in one row, what needs you now, and the full funnel + weekly
 * chart folded away (opens on demand, remembered per device). The board itself stays on the first screen.
 */
export function FunnelCard({ applications, quietDays = 14 }: { applications: LookApp[]; quietDays?: number }) {
  const [period, setPeriod] = useState<Period>('30');
  const [days, setDays] = useState(quietDaysOf(quietDays));
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setDays(quietDaysOf(quietDays)); }, [quietDays]);
  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN_KEY) === '1'); } catch { /* private mode: stays folded */ }
  }, []);
  const toggle = () => {
    setOpen((o) => {
      try { localStorage.setItem(OPEN_KEY, o ? '0' : '1'); } catch { /* ignore */ }
      return !o;
    });
  };
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
  const urgent = look.rows.filter((r) => r.kind !== 'quiet');
  const quiet = look.rows.filter((r) => r.kind === 'quiet');
  if (!applications.some((a) => a.appliedAt)) return null;

  return (
    <section className="mb-5 space-y-3">
      <div className="rounded-[var(--radius-card)] border border-line">
        <div className="grid grid-cols-4 gap-x-3 gap-y-3 px-4 py-3.5 md:gap-x-4 md:px-5 md:py-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-center">
          <Stat value={f.applied} label={`applied · ${PERIODS.find((p) => p.key === period)!.label.toLowerCase()}`} />
          <Stat value={f.replyRate != null ? `${f.replyRate}%` : '—'} label={`replied (${f.replied})`} />
          <Stat value={f.interviews} label="interviews" tone={f.interviews ? 'accent' : undefined} />
          <Stat value={f.silent} label={`no reply after ${days} days`} />
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="col-span-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line px-3.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg lg:col-span-1"
          >
            {open ? 'Hide funnel' : 'Funnel & weeks'} <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </button>
        </div>

        {open && (
          <div className="grid gap-6 border-t border-line px-5 py-5 md:grid-cols-[1.3fr_1fr]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-medium">Your funnel</p>
                <div className="flex rounded-full bg-surface-2 p-0.5 text-[13px]">
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
              <label className="flex items-center justify-between gap-2 pt-1 text-[13.5px] text-muted">
                Count as “no reply” after
                <select
                  aria-label="No reply after"
                  value={days}
                  onChange={(e) => void chooseQuiet(Number(e.target.value))}
                  className="h-8 rounded-full border border-line bg-bg px-2.5 text-[13.5px] text-fg"
                >
                  {QUIET_DAYS.map((n) => <option key={n} value={n}>{n} days</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-col">
              <p className="mb-3 text-[14px] font-medium">Applications per week</p>
              <div className="flex flex-1 items-end gap-1.5" style={{ minHeight: 96 }}>
                {f.weeks.map((w, i) => (
                  <div key={w.start} className="flex flex-1 flex-col items-center gap-1" title={`Week of ${w.start}: ${w.count}`}>
                    <span className="text-[12px] tabular-nums text-muted">{w.count || ''}</span>
                    <div className={cn('w-full rounded-t-[4px]', i === f.weeks.length - 1 ? 'bg-accent' : 'bg-accent/45')} style={{ height: `${Math.round((w.count / peak) * 72) + 2}px` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[12px] text-muted">
                <span>{f.weeks[0]?.start.slice(5).replace('-', '.')}</span>
                <span>this week</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {look.rows.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-line px-5 py-3.5">
          <p className="mb-1.5 text-[14px] font-semibold">Needs you</p>
          <ul className="grid gap-x-6 md:grid-cols-2">
            {[...urgent, ...quiet].slice(0, showAll ? undefined : NEEDS_SHOWN).map((item, i) => (
              <li key={`${item.kind}-${item.id}`} className={cn(!showAll && i >= NEEDS_SHOWN_PHONE && 'max-md:hidden')}>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent(OPEN_APPLICATION, { detail: item.id }))}
                  className="group flex w-full items-center gap-3 rounded-lg py-2 text-left"
                >
                  <span className={cn('size-2 shrink-0 rounded-full', item.kind === 'soon' ? 'bg-accent' : item.kind === 'past' ? 'bg-st-applied' : 'bg-fit-ok')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium leading-tight group-hover:underline">{item.role} <span className="font-normal text-muted">· {item.company}</span></span>
                    <span className="block truncate text-[13.5px] text-muted">{item.text}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-subtle" />
                </button>
              </li>
            ))}
          </ul>
          {look.rows.length > NEEDS_SHOWN_PHONE && (
            <button type="button" onClick={() => setShowAll((s) => !s)} className={cn('mt-1 text-[13.5px] font-medium text-accent', !showAll && look.rows.length <= NEEDS_SHOWN && 'md:hidden')}>
              {showAll ? 'Show less' : `Show all ${look.rows.length}`}
            </button>
          )}
          {showAll && look.quietMore > 0 && <p className="pt-1 text-[13px] text-muted">and {look.quietMore} more with no reply — filter by “Applied” below.</p>}
        </div>
      )}
    </section>
  );
}
