'use client';

import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/components/telegram-ui';

export function Chip({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        haptic('light');
        onClick();
      }}
      className={cn(
        'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-[14px] font-medium transition-all active:scale-[0.97]',
        on ? 'border-accent bg-accent-soft text-fg' : 'border-line bg-bg text-muted hover:border-line-strong hover:text-fg',
        className,
      )}
    >
      {on && <Check className="size-3.5 text-accent" strokeWidth={2.5} />}
      {children}
    </button>
  );
}

/** One-of chips. */
export function ChipChoice<T extends string>({ options, value, onChange }: { options: ReadonlyArray<readonly [T, string]>; value: T | null | undefined; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([id, label]) => (
        <Chip key={id} on={value === id} onClick={() => onChange(id)}>{label}</Chip>
      ))}
    </div>
  );
}

/** Many-of chips. */
export function ChipMulti<T extends string>({ options, value, onChange }: { options: ReadonlyArray<readonly [T, string]>; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([id, label]) => (
        <Chip key={id} on={value.includes(id)} onClick={() => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])}>
          {label}
        </Chip>
      ))}
    </div>
  );
}

/** Editable list of chips: tap a suggestion to add it, × to remove, or type your own. */
export function ChipList({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Add your own',
  max = 20,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState('');
  const lower = new Set(value.map((v) => v.toLowerCase()));
  const add = (v: string) => {
    const clean = v.trim();
    if (!clean || lower.has(clean.toLowerCase()) || value.length >= max) return;
    haptic('light');
    onChange([...value, clean]);
  };
  const rest = suggestions.filter((s) => !lower.has(s.toLowerCase())).slice(0, 12);
  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((v) => (
            <span key={v} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-accent bg-accent-soft pl-4 pr-1.5 text-[14px] font-medium">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-fg">
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rest.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-line-strong px-3.5 text-[13.5px] text-muted transition-colors hover:border-accent hover:text-fg">
              <Plus className="size-3.5" /> {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
          setDraft('');
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 py-2.5 text-[14.5px] outline-none focus:border-accent"
        />
        <button type="submit" disabled={!draft.trim()} className="rounded-full bg-fg px-4 text-[14px] font-medium text-bg disabled:opacity-30">
          Add
        </button>
      </form>
    </div>
  );
}

export function Toggle({ on, onChange, label, detail }: { on: boolean; onChange: (v: boolean) => void; label: string; detail?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => { haptic('light'); onChange(!on); }} className="flex w-full items-center gap-4 rounded-[var(--radius-card)] border border-line px-5 py-4 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {detail && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{detail}</span>}
      </span>
      <span className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-line-strong')}>
        <span className={cn('absolute top-0.5 size-6 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}
