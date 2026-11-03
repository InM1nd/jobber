'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReadableSection } from '@/lib/jobs/readable';

/** One part of the ad as a short list; long ones fold, the company blurb starts folded. */
export function AdSection({ section }: { section: ReadableSection }) {
  const fold = section.kind === 'about';
  const [open, setOpen] = useState(!fold);
  const [all, setAll] = useState(false);
  const shown = all ? section.items : section.items.slice(0, 5);
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <span className="text-[14px] font-semibold">{section.title}</span>
        <ChevronDown className={cn('size-4 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <ul className="mt-3 max-w-[68ch] space-y-2.5">
            {shown.map((it) => (
              <li key={it} className="flex gap-2.5 text-[14px] leading-relaxed text-fg">
                <span className="mt-[9px] size-1 shrink-0 rounded-full bg-subtle" />
                <span>{it}</span>
              </li>
            ))}
          </ul>
          {section.items.length > shown.length && (
            <button type="button" onClick={() => setAll(true)} className="mt-2 min-h-11 text-[13px] font-medium text-accent">Show {section.items.length - shown.length} more</button>
          )}
        </>
      )}
    </section>
  );
}

/** The whole ad, section by section. */
export function AdSections({ sections }: { sections: ReadableSection[] }) {
  return <>{sections.map((s) => <AdSection key={`${s.kind}-${s.title}`} section={s} />)}</>;
}
