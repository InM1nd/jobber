'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** Jump links: a sticky row of chips on the phone, a sticky side list on desktop; the visible group is highlighted. */
export function SectionNav({ sections, label }: { sections: ReadonlyArray<{ id: string; label: string }>; label: string }) {
  const [active, setActive] = useState(sections[0]?.id || '');
  useEffect(() => {
    const els = sections.map((g) => document.getElementById(g.id)).filter((e): e is HTMLElement => Boolean(e));
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [sections]);
  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  };
  return (
    <nav aria-label={label} className="sticky top-[calc(8px+var(--safe-top))] z-20 -mx-5 mb-5 bg-bg/90 px-5 py-2 backdrop-blur lg:top-8 lg:mx-0 lg:mb-0 lg:self-start lg:bg-transparent lg:p-0 lg:backdrop-blur-0">
      <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:gap-0.5">
        {sections.map((g) => (
          <li key={g.id} className="shrink-0">
            <button
              type="button"
              onClick={() => go(g.id)}
              aria-current={active === g.id ? 'true' : undefined}
              className={cn(
                'min-h-11 rounded-full px-3.5 text-[14px] font-medium transition-colors lg:w-full lg:text-left',
                active === g.id ? 'bg-fg text-bg' : 'bg-surface-2 text-muted hover:text-fg lg:bg-transparent',
              )}
            >
              {g.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
