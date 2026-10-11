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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 border-b border-line">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSegment(s.key)}
            className={cn(
              '-mb-px flex flex-col items-center border-b py-2 text-[12px] transition-colors',
              segment === s.key ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            <span className="text-[15px] font-medium tabular-nums leading-tight">{counts[s.key]}</span>
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
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted">Nothing in {current.label.toLowerCase()}.</p>
      ) : (
        <div className="divide-y divide-line">
          {visible.map((app) => (
            <article key={app.id} className="animate-in py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-medium leading-snug">{app.role}</h3>
                  <p className="text-[13px] text-muted">{app.company}</p>
                </div>
                <label className={cn('relative inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border border-line py-0.5 pl-2 pr-1 text-[12px] font-medium transition-colors hover:bg-surface-2', TONE[app.status] || TONE.to_apply)}>
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
          ))}
        </div>
      )}
    </div>
  );
}
