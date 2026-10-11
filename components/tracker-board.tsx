'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, BellRing, ChevronDown, KanbanSquare, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, fieldClass } from '@/components/ui/kit';
import { haptic } from '@/components/telegram-ui';
import { cn } from '@/lib/utils';
import type { DemoApplication } from '@/lib/demo/store';

const STATUSES = ['to_apply', 'applied', 'interview', 'on_hold', 'offer', 'rejected', 'skip'] as const;

const LABELS: Record<string, string> = {
  to_apply: 'To apply',
  applied: 'Applied',
  interview: 'Interview',
  on_hold: 'On hold',
  offer: 'Offer',
  rejected: 'Rejected',
  skip: 'Skipped',
};

const TONE: Record<string, string> = {
  to_apply: 'text-muted', applied: 'text-st-applied', interview: 'text-st-interview', on_hold: 'text-muted',
  offer: 'text-st-offer', rejected: 'text-subtle', skip: 'text-subtle',
};
const DOT: Record<string, string> = {
  to_apply: 'bg-subtle', applied: 'bg-st-applied', interview: 'bg-st-interview', on_hold: 'bg-subtle',
  offer: 'bg-st-offer', rejected: 'bg-line-strong', skip: 'bg-line-strong',
};
const SEG_DOT: Record<string, string> = { to_apply: 'bg-subtle', applied: 'bg-st-applied', interview: 'bg-st-interview', closed: 'bg-line-strong' };

const SEGMENTS = [
  { key: 'to_apply', label: 'To apply', match: ['to_apply'] },
  { key: 'applied', label: 'Applied', match: ['applied', 'on_hold'] },
  { key: 'interview', label: 'Interview', match: ['interview', 'offer'] },
  { key: 'closed', label: 'Closed', match: ['rejected', 'skip'] },
] as const;

function shortDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function TrackerBoard({ applications }: { applications: DemoApplication[] }) {
  const router = useRouter();
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]['key']>(() => {
    const firstWithItems = SEGMENTS.find((s) => applications.some((a) => (s.match as readonly string[]).includes(a.status)));
    return firstWithItems?.key ?? 'to_apply';
  });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

  const counts = useMemo(
    () => Object.fromEntries(SEGMENTS.map((s) => [s.key, applications.filter((a) => (s.match as readonly string[]).includes(a.status)).length])),
    [applications],
  );
  const current = SEGMENTS.find((s) => s.key === segment)!;
  const visible = applications.filter((a) => (current.match as readonly string[]).includes(a.status));

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, role, url, notes, status: 'to_apply' }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || 'Could not add the application');
      haptic('error');
      return;
    }
    setCompany('');
    setRole('');
    setUrl('');
    setNotes('');
    setAdding(false);
    setSegment('to_apply');
    haptic('success');
    router.refresh();
  }

  async function setStatus(id: string, status: string) {
    haptic('light');
    await fetch(`/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  const card = (app: DemoApplication, compact = false) => (
            <article key={app.id} className={cn('animate-in px-5 py-4', compact && 'rounded-[14px] border border-line bg-bg px-4 py-3.5')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.02em]">{app.role}</h3>
                  <p className="text-[13px] text-muted">{app.company}</p>
                </div>
                <label className={cn('relative inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line py-1 pl-2.5 pr-1.5 text-[12px] font-medium transition-colors hover:bg-surface-2', TONE[app.status] || TONE.to_apply)}>
                  <span className={cn('size-1.5 rounded-full', DOT[app.status] || DOT.to_apply)} />
                  {LABELS[app.status] || 'To apply'}
                  <ChevronDown className="size-3.5 opacity-70" />
                  <select
                    aria-label="Status"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    value={STATUSES.includes(app.status as (typeof STATUSES)[number]) ? app.status : 'to_apply'}
                    onChange={(event) => setStatus(app.id, event.target.value)}
                  >
                    {STATUSES.map((status) => <option key={status} value={status}>{LABELS[status]}</option>)}
                  </select>
                </label>
              </div>
              {app.notes && <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted">{app.notes}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-subtle">
                {app.appliedAt && <span>Applied {shortDate(app.appliedAt)}</span>}
                {app.followUpAt && (
                  <span className="inline-flex items-center gap-1 text-muted">
                    <BellRing className="size-3.5" /> Follow up {shortDate(app.followUpAt)}{app.followUpSent ? ' · sent' : ''}
                  </span>
                )}
                {app.salaryExpectation && <span>{app.salaryExpectation}</span>}
                {app.url && (
                  <a className="ml-auto inline-flex items-center gap-0.5 text-accent" href={app.url} target="_blank" rel="noreferrer">
                    Listing <ArrowUpRight className="size-3.5" />
                  </a>
                )}
              </div>
            </article>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-0.5 rounded-[14px] bg-surface-2 p-[3px] lg:hidden">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSegment(s.key)}
            className={cn(
              'flex flex-col items-center rounded-[11px] py-2 text-[12px] transition-all active:scale-[0.97]',
              segment === s.key ? 'bg-bg font-semibold text-fg shadow-[0_1px_3px_rgb(0_0_0/0.08)] dark:bg-[#1c1c1f]' : 'text-muted hover:text-fg',
            )}
          >
            <span className="text-[20px] font-semibold tabular-nums leading-tight tracking-[-0.03em]">{counts[s.key]}</span>
            <span className="inline-flex items-center gap-1.5"><span className={cn('size-1.5 rounded-full', SEG_DOT[s.key])} />{s.label}</span>
          </button>
        ))}
      </div>

      {adding ? (
        <form onSubmit={add} className="animate-in space-y-2.5 rounded-[var(--radius-card)] border border-line p-4">
          <div className="flex items-center justify-between pb-1">
            <p className="text-[15px] font-semibold">New application</p>
            <button type="button" onClick={() => setAdding(false)} className="rounded-full p-1 text-muted hover:bg-surface-2" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="grid gap-2.5 md:grid-cols-2">
            <input className={fieldClass} placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} required />
            <input className={fieldClass} placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} required />
          </div>
          <input className={fieldClass} placeholder="Listing URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <textarea className={fieldClass} rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <Button type="submit" className="w-full">Add to tracker</Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-10 items-center gap-1.5 text-[13.5px] font-medium text-accent transition-opacity hover:opacity-80"
        >
          <Plus className="size-4" /> Add application
        </button>
      )}

      {applications.length === 0 && !adding ? (
        <EmptyState
          icon={KanbanSquare}
          title="Nothing tracked yet"
          text="Add roles you’re applying to. Moving one to Applied schedules a follow-up reminder in 7 days."
        />
      ) : (
        <>
        <div className="hidden grid-cols-4 items-start gap-4 lg:grid">
          {SEGMENTS.map((seg) => {
            const items = applications.filter((a) => (seg.match as readonly string[]).includes(a.status));
            return (
              <section key={seg.key} className="min-h-[320px] rounded-[var(--radius-card)] bg-surface-2/70 p-2.5">
                <h2 className="flex items-center justify-between px-2 pb-2.5 pt-1 text-[13px] font-semibold">
                  <span className="inline-flex items-center gap-2"><span className={cn('size-1.5 rounded-full', SEG_DOT[seg.key])} />{seg.label}</span>
                  <span className="tabular-nums text-muted">{items.length}</span>
                </h2>
                <div className="space-y-2">
                  {items.length ? items.map((app) => card(app, true)) : <p className="px-2 py-6 text-center text-[12.5px] text-subtle">Nothing here</p>}
                </div>
              </section>
            );
          })}
        </div>
        <div className="lg:hidden">
        {visible.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted">Nothing in {current.label.toLowerCase()}.</p>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line">
          {visible.map((app) => card(app))}
        </div>
      )}
        </div>
        </>
      )}
    </div>
  );
}
