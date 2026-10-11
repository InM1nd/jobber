'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RunView {
  id: string;
  status: string;
  sourcesTotal: number;
  sourcesDone: number;
  jobsFound: number;
  filtered: number;
  scored: number;
  queued: number;
  aiCalls?: number;
  firstMatchAt?: string | null;
  note: string | null;
}

export function runLabel(run: RunView) {
  if (run.status === 'fetching') {
    if (run.scored) return `${run.scored} matches ready · still searching (${run.jobsFound} found)`;
    return run.jobsFound ? `Finding jobs… ${run.jobsFound} found` : 'Finding jobs…';
  }
  if (run.status === 'scoring') return `${run.jobsFound} found · scoring… ${run.scored} scored`;
  if (run.status === 'error') return 'Search stopped';
  return `${run.scored} scored · ${run.filtered} skipped by filters`;
}

function progress(run: RunView) {
  if (run.status === 'done') return 1;
  const fetch = run.sourcesTotal ? run.sourcesDone / run.sourcesTotal : 1;
  if (run.status === 'fetching') return 0.05 + fetch * 0.45;
  const total = run.scored + run.queued;
  return 0.5 + (total ? run.scored / total : 0) * 0.48;
}

/** Drives a search run step by step (each step is one short request) and shows progress. */
export function SearchProgress({ initial, onDone, className }: { initial: RunView; onDone?: (run: RunView) => void; className?: string }) {
  const router = useRouter();
  const [run, setRun] = useState(initial);
  const [error, setError] = useState('');
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let current = initial;
    let failures = 0;
    async function loop() {
      while (!stopped.current && (current.status === 'fetching' || current.status === 'scoring')) {
        const res = await fetch('/api/search/step', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ runId: current.id }),
        }).catch(() => null);
        const body = res ? await res.json().catch(() => ({})) : {};
        if (!res?.ok || !body.run) {
          failures++;
          if (failures >= 3) {
            setError(body.error || 'Lost connection. The search continues in the background.');
            return;
          }
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        failures = 0;
        // Progressive results: show new matches as soon as each AI batch lands.
        if (body.run.scored > current.scored) router.refresh();
        current = body.run;
        setRun(current);
      }
      if (!stopped.current && current.status === 'done') {
        onDone?.(current);
        router.refresh();
      }
    }
    void loop();
    return () => {
      stopped.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id]);

  const done = run.status === 'done';
  return (
    <div className={cn('animate-in rounded-[var(--radius-card)] border border-line bg-bg px-5 py-4', className)} aria-live="polite">
      <div className="flex items-center gap-3">
        {done ? (
          <span className="flex size-7 items-center justify-center rounded-full bg-accent text-accent-fg"><Check className="size-4" strokeWidth={2.5} /></span>
        ) : (
          <Loader2 className="size-5 animate-spin text-accent" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] font-medium tracking-[-0.01em]">{done ? 'Search complete' : runLabel(run)}</p>
          <p className="truncate text-[12.5px] text-muted">
            {done ? runLabel(run) : run.status === 'fetching' ? `Checking ${run.sourcesDone}/${run.sourcesTotal} job boards` : 'AI compares the best-ranked jobs with your CVs'}
          </p>
        </div>
      </div>
      <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: `${Math.round(progress(run) * 100)}%` }} />
      </div>
      {(run.note || error) && <p className="mt-2.5 text-[12.5px] leading-snug text-muted">{error || run.note}</p>}
    </div>
  );
}
