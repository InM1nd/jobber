'use client';

import { useState } from 'react';
import { Building2, Check, Loader2, Plus, Sparkles } from 'lucide-react';
import { Notice } from '@/components/ui/kit';
import { haptic } from '@/components/telegram-ui';
import { cn } from '@/lib/utils';

export interface CompanyOption {
  name: string;
  ats: string;
  slug: string;
  place?: string | null;
  industry?: string | null;
  jobs?: number;
  suggested?: boolean;
  custom?: boolean;
  cities?: string[];
  countries?: string[];
}

export const keyOf = (c: Pick<CompanyOption, 'ats' | 'slug'>) => `${c.ats}:${c.slug}`;

/** Tick the companies whose job boards Jobber should check every day. */
export function CompaniesWatch({
  options,
  selected,
  onToggle,
  onAdd,
}: {
  options: CompanyOption[];
  selected: Set<string>;
  onToggle: (c: CompanyOption) => void;
  onAdd: (c: CompanyOption) => void;
}) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setError('');
    const res = await fetch('/api/companies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      setError(data.error || 'Could not check that company.');
      haptic('error');
      return;
    }
    haptic('success');
    setInput('');
    onAdd({ ...data.company, custom: true, place: `${data.company.jobs} open jobs` });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="space-y-2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Company name or careers page link"
            className="min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 py-3 text-[14.5px] outline-none focus:border-accent"
          />
          <button type="submit" disabled={busy || !input.trim()} className="flex items-center gap-1.5 rounded-full bg-fg px-4 text-[14px] font-medium text-bg disabled:opacity-30">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
          </button>
        </div>
        <p className="px-1 text-[12px] leading-relaxed text-subtle">Jobber finds their public job board (Greenhouse, Lever, Workday, Personio, Teamtailor and more) and checks it daily.</p>
      </form>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line">
        {options.map((c) => {
          const on = selected.has(keyOf(c));
          return (
            <button
              key={keyOf(c)}
              type="button"
              onClick={() => { haptic('light'); onToggle(c); }}
              className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-[7px] border transition-colors', on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong')}>
                {on && <Check className="size-4" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-medium tracking-[-0.01em]">{c.name}</span>
                  {c.suggested && <Sparkles className="size-3.5 shrink-0 text-accent" aria-label="Suggested for you" />}
                </span>
                <span className="block truncate text-[12.5px] text-muted">
                  {[c.place, c.industry, c.custom ? 'added by you' : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <Building2 className="size-4 shrink-0 text-subtle" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
