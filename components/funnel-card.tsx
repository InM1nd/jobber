'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { funnel, type FunnelApp, type Period } from '@/lib/tracker/funnel';

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: 'all', label: 'All' },
];

function Step({ label, value, of, hint }: { label: string; value: number; of: number; hint?: string }) {
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
    </div>
  );
}

/** Applied → replied → interview → offer, from the tracker, plus a week-by-week chart. */
export function FunnelCard({ applications }: { applications: FunnelApp[] }) {
  const [period, setPeriod] = useState<Period>('30');
  const f = useMemo(() => funnel(applications, period), [applications, period]);
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
        <Step label="Interview" value={f.interviews} of={f.applied} hint={f.interviewRate != null ? `${f.interviewRate}%` : undefined} />
        <Step label="Offer" value={f.offers} of={f.applied} />
        {f.silent > 0 && <p className="text-[12px] text-subtle">{f.silent} without any answer after two weeks — worth a follow-up or letting go.</p>}
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
    </section>
  );
}
