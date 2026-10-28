import { Check, Minus, X } from 'lucide-react';
import type { RequirementItem } from '@/lib/search/requirements';

const ICON = {
  covered: <Check className="size-3.5 text-fit-strong" />,
  partial: <Minus className="size-3.5 text-fit-ok" />,
  gap: <X className="size-3.5 text-fit-weak" />,
};

/** The job's key requirements, each checked against your profile by code (not the AI). */
export function RequirementsList({ items }: { items?: RequirementItem[] | null }) {
  if (!items?.length) return null;
  const covered = items.filter((i) => i.result === 'covered').length;
  return (
    <section className="rounded-[var(--radius-card)] border border-line px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-medium">Requirements</p>
        <p className="text-[12px] text-subtle">{covered} of {items.length} covered</p>
      </div>
      <ul className="space-y-2.5">
        {items.map((it) => (
          <li key={it.text} className="flex items-start gap-2.5">
            <span className="mt-[3px] flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2">{ICON[it.result]}</span>
            <span className="min-w-0">
              <span className="text-[13.5px] leading-snug">
                {it.text}
                {it.must && <span className="ml-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">must</span>}
              </span>
              <span className="block text-[12px] text-muted">{it.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
