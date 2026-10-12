'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, BellRing, ChevronDown, KanbanSquare, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, fieldClass, fitOf, FIT_TEXT } from '@/components/ui/kit';
import { haptic } from '@/components/telegram-ui';
import { cn } from '@/lib/utils';
import type { DemoApplication } from '@/lib/demo/store';

type App = DemoApplication;

const STATUSES = ['to_apply', 'check_listing', 'applied', 'interview', 'on_hold', 'offer', 'rejected', 'skip'] as const;
const LABELS: Record<string, string> = {
  to_apply: 'To apply', check_listing: 'Check listing', applied: 'Applied', interview: 'Interview',
  on_hold: 'On hold', offer: 'Offer', rejected: 'Rejected', skip: 'Skipped',
};
const DOT: Record<string, string> = {
  to_apply: 'bg-accent', check_listing: 'bg-fit-ok', applied: 'bg-st-applied', interview: 'bg-st-interview',
  on_hold: 'bg-subtle', offer: 'bg-st-offer', rejected: 'bg-line-strong', skip: 'bg-line-strong',
};
const TABS = [
  { key: 'active', label: 'Active', match: ['to_apply', 'check_listing', 'applied', 'interview', 'on_hold', 'offer'] },
  { key: 'todo', label: 'To apply', match: ['to_apply', 'check_listing'] },
  { key: 'applied', label: 'Applied', match: ['applied', 'on_hold'] },
  { key: 'interview', label: 'Interview', match: ['interview', 'offer'] },
  { key: 'closed', label: 'Closed', match: ['rejected', 'skip'] },
  { key: 'all', label: 'All', match: STATUSES as readonly string[] },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const SORTS = { followup: 'Follow-up', updated: 'Recently updated', priority: 'Priority', company: 'Company A–Z' } as const;
type SortKey = keyof typeof SORTS;
const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PRIO_DOT: Record<string, string> = { high: 'bg-fit-strong', medium: 'bg-fit-good', low: 'bg-line-strong' };
const PAGE = 40;

const day = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
const isDue = (a: App) => !!a.followUpAt && !a.followUpSent && ['applied', 'on_hold'].includes(a.status) && new Date(a.followUpAt).getTime() <= endOfToday();
const toInput = (v: string | null) => (v ? v.slice(0, 10) : '');

function StatusPill({ status, onChange, className }: { status: string; onChange: (s: string) => void; className?: string }) {
  return (
    <label
      onClick={(e) => e.stopPropagation()}
      className={cn('relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line pl-2.5 pr-1.5 text-[12px] font-medium text-fg transition-colors hover:bg-surface-2', className)}
    >
      <span className={cn('size-1.5 rounded-full', DOT[status] || DOT.to_apply)} />
      <span className="whitespace-nowrap">{LABELS[status] || 'To apply'}</span>
      <ChevronDown className="size-3.5 text-subtle" />
      <select aria-label="Status" className="absolute inset-0 cursor-pointer opacity-0" value={status} onChange={(e) => onChange(e.target.value)}>
        {STATUSES.map((s) => <option key={s} value={s}>{LABELS[s]}</option>)}
      </select>
    </label>
  );
}

export function TrackerBoard({ applications }: { applications: App[] }) {
  const router = useRouter();
  const [items, setItems] = useState(applications);
  useEffect(() => setItems(applications), [applications]);
  const [tab, setTab] = useState<TabKey>('active');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('followup');
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, items.filter((a) => (t.match as readonly string[]).includes(a.status)).length])), [items]);
  const { due, rest } = useMemo(() => {
    const tabDef = TABS.find((t) => t.key === tab)!;
    const q = query.trim().toLowerCase();
    const list = items.filter(
      (a) => (tabDef.match as readonly string[]).includes(a.status) && (!q || `${a.company} ${a.role} ${a.location ?? ''}`.toLowerCase().includes(q)),
    );
    const t = (v?: string | null) => (v ? new Date(v).getTime() : Number.MAX_SAFE_INTEGER);
    const u = (a: App) => (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
    const cmp: Record<SortKey, (a: App, b: App) => number> = {
      followup: (a, b) => t(a.followUpAt) - t(b.followUpAt) || u(b) - u(a),
      updated: (a, b) => u(b) - u(a),
      priority: (a, b) => (PRIO_RANK[a.priority ?? ''] ?? 3) - (PRIO_RANK[b.priority ?? ''] ?? 3) || (b.score ?? 0) - (a.score ?? 0),
      company: (a, b) => a.company.localeCompare(b.company),
    };
    list.sort(cmp[sort]);
    return { due: list.filter(isDue), rest: list.filter((a) => !isDue(a)) };
  }, [items, tab, query, sort]);
  const open = items.find((a) => a.id === openId) || null;

  async function patch(id: string, data: Partial<App>) {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...data, updatedAt: new Date().toISOString() } : a)));
    const res = await fetch(`/api/applications/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) haptic('error');
    router.refresh();
  }
  const setStatus = (id: string, status: string) => { haptic('light'); void patch(id, { status }); };

  const row = (a: App) => {
    const date = a.followUpAt && ['applied', 'on_hold'].includes(a.status) ? a.followUpAt : a.appliedAt;
    return (
      <li key={a.id}>
        <button
          type="button"
          onClick={() => setOpenId(a.id)}
          className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2/70 active:bg-surface-2 lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_72px_132px_88px] lg:gap-4"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span title={a.priority ? `${a.priority} priority` : undefined} className={cn('size-2 shrink-0 rounded-full', PRIO_DOT[a.priority ?? ''] || 'bg-transparent ring-1 ring-line-strong ring-inset')} />
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-semibold leading-tight tracking-[-0.01em]">{a.role}</p>
              <p className="truncate text-[12.5px] text-muted">
                {a.company}
                <span className="lg:hidden">{a.location ? ` · ${a.location}` : ''}</span>
              </p>
            </div>
          </div>
          <p className="hidden truncate text-[13px] text-muted lg:block">{a.location || '—'}</p>
          <p className={cn('hidden text-[13px] font-semibold tabular-nums lg:block', a.score != null ? FIT_TEXT[fitOf(a.score)] : 'text-subtle')}>{a.score ?? '—'}</p>
          <div className="hidden lg:block"><StatusPill status={a.status} onChange={(s) => setStatus(a.id, s)} /></div>
          <div className="flex shrink-0 flex-col items-end gap-1 lg:items-start">
            <div className="lg:hidden"><StatusPill status={a.status} onChange={(s) => setStatus(a.id, s)} /></div>
            {date ? (
              <span className={cn('inline-flex items-center gap-1 text-[11.5px] tabular-nums', isDue(a) ? 'font-semibold text-fit-weak' : 'text-subtle')}>
                {date === a.followUpAt && <BellRing className="size-3" />}
                {day(date)}
              </span>
            ) : <span className="hidden text-[12px] text-subtle lg:inline">—</span>}
          </div>
        </button>
      </li>
    );
  };

  const shown = rest.slice(0, Math.max(0, limit - due.length));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
            placeholder="Search company or role"
            className="h-10 w-full rounded-full bg-surface-2 pl-9 pr-3 text-[14px] outline-none placeholder:text-subtle focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <label className="relative inline-flex h-10 items-center gap-1 rounded-full bg-surface-2 pl-3.5 pr-2.5 text-[13px] font-medium">
          <span className="hidden sm:inline text-muted">Sort:</span> {SORTS[sort]}
          <ChevronDown className="size-3.5 text-subtle" />
          <select aria-label="Sort" className="absolute inset-0 cursor-pointer opacity-0" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setAdding(true)} aria-label="Add application" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform active:scale-95 sm:w-auto sm:gap-1.5 sm:px-4 sm:text-[13.5px] sm:font-semibold">
          <Plus className="size-4" /><span className="hidden sm:inline">Add</span>
        </button>
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] md:mx-0 md:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setLimit(PAGE); haptic('light'); }}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors',
              tab === t.key ? 'bg-fg text-bg' : 'bg-surface-2 text-muted hover:text-fg',
            )}
          >
            {t.label}
            <span className={cn('tabular-nums text-[12px]', tab === t.key ? 'opacity-70' : 'text-subtle')}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={KanbanSquare} title="Nothing tracked yet" text="Add roles you’re applying to. Moving one to Applied schedules a follow-up reminder in 7 days." />
      ) : due.length + rest.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-muted">Nothing here{query ? ` for “${query}”` : ''}.</p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-bg">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_72px_132px_88px] gap-4 border-b border-line px-4 py-2 text-[11.5px] font-medium uppercase tracking-[0.12em] text-subtle lg:grid">
            <span className="pl-5">Role</span><span>Location</span><span>Score</span><span>Status</span><span>Date</span>
          </div>
          {due.length > 0 && (
            <>
              <p className="flex items-center gap-1.5 bg-fit-weak/8 px-4 py-2 text-[12px] font-semibold text-fit-weak">
                <BellRing className="size-3.5" /> Follow-up due · {due.length}
              </p>
              <ul className="divide-y divide-line border-b border-line">{due.map(row)}</ul>
            </>
          )}
          <ul className="divide-y divide-line">{shown.map(row)}</ul>
          {rest.length > shown.length && (
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="w-full border-t border-line py-3 text-[13px] font-medium text-accent hover:bg-surface-2/70">
              Show {Math.min(PAGE, rest.length - shown.length)} more · {rest.length - shown.length} left
            </button>
          )}
        </div>
      )}

      {open && <DetailSheet app={open} onClose={() => setOpenId(null)} onPatch={(d) => patch(open.id, d)} />}
      {adding && <AddSheet onClose={() => setAdding(false)} onAdded={() => { setAdding(false); setTab('todo'); router.refresh(); }} />}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/35 backdrop-blur-[2px] animate-in" />
      <aside className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-[26px] bg-bg shadow-lift animate-in md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-[26px]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong md:hidden" />
        <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-3 md:pt-6">
          <div className="min-w-0">{title}</div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-2" aria-label="Close"><X className="size-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-[calc(20px+var(--safe-bottom,0px))]">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-subtle">{label}</p>
      {children}
    </div>
  );
}

function DetailSheet({ app, onClose, onPatch }: { app: App; onClose: () => void; onPatch: (d: Partial<App>) => Promise<void> }) {
  const [notes, setNotes] = useState(app.notes ?? '');
  const [next, setNext] = useState(app.nextAction ?? '');
  const dirty = notes !== (app.notes ?? '') || next !== (app.nextAction ?? '');
  return (
    <Sheet
      onClose={onClose}
      title={
        <>
          <p className="text-[18px] font-semibold leading-snug tracking-[-0.02em]">{app.role}</p>
          <p className="text-[13.5px] text-muted">{app.company}{app.location ? ` · ${app.location}` : ''}</p>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={app.status} onChange={(s) => { haptic('light'); void onPatch({ status: s }); }} className="h-8" />
          <div className="inline-flex h-8 rounded-full bg-surface-2 p-0.5 text-[12px] font-medium">
            {(['high', 'medium', 'low'] as const).map((p) => (
              <button key={p} type="button" onClick={() => void onPatch({ priority: p })} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 capitalize', app.priority === p ? 'bg-bg text-fg shadow-soft' : 'text-muted')}>
                <span className={cn('size-1.5 rounded-full', PRIO_DOT[p])} />{p}
              </button>
            ))}
          </div>
          {app.score != null && <span className={cn('text-[13px] font-semibold tabular-nums', FIT_TEXT[fitOf(app.score)])}>{app.score}/100</span>}
          {app.url && (
            <a href={app.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-0.5 text-[13px] font-medium text-accent">Listing <ArrowUpRight className="size-3.5" /></a>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Applied">
            <input type="date" className={cn(fieldClass, 'h-10')} value={toInput(app.appliedAt)} onChange={(e) => void onPatch({ appliedAt: e.target.value || null })} />
          </Field>
          <Field label="Follow-up">
            <input type="date" className={cn(fieldClass, 'h-10', isDue(app) && 'text-fit-weak')} value={toInput(app.followUpAt)} onChange={(e) => void onPatch({ followUpAt: e.target.value || null })} />
          </Field>
        </div>

        {app.whyFit && <Field label="Why it fits"><p className="text-[14px] leading-relaxed">{app.whyFit}</p></Field>}
        {app.risks && <Field label="Risks"><p className="whitespace-pre-line text-[14px] leading-relaxed text-muted">{app.risks}</p></Field>}
        <Field label="Next action">
          <textarea className={fieldClass} rows={2} value={next} onChange={(e) => setNext(e.target.value)} placeholder="What’s the next step?" />
        </Field>
        <Field label="Notes">
          <textarea className={fieldClass} rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contacts, what you sent, salary you named…" />
        </Field>
        {dirty && <Button className="w-full" onClick={() => void onPatch({ notes, nextAction: next })}>Save notes</Button>}
        <p className="text-[12px] text-subtle">
          {app.source ? `Source: ${app.source}` : ''}{app.source && app.updatedAt ? ' · ' : ''}{app.updatedAt ? `Updated ${day(app.updatedAt)}` : ''}
        </p>
      </div>
    </Sheet>
  );
}

function AddSheet({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const res = await fetch('/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company, role, url, notes, status: 'to_apply' }) });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || 'Could not add the application');
      haptic('error');
      return;
    }
    haptic('success');
    onAdded();
  }
  return (
    <Sheet onClose={onClose} title={<p className="text-[18px] font-semibold tracking-[-0.02em]">New application</p>}>
      <form onSubmit={add} className="space-y-2.5">
        <input className={fieldClass} placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} required autoFocus />
        <input className={fieldClass} placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} required />
        <input className={fieldClass} placeholder="Listing URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <textarea className={fieldClass} rows={3} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <Button type="submit" className="w-full">Add to tracker</Button>
      </form>
    </Sheet>
  );
}
