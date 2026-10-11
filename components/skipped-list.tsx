'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Sparkles } from 'lucide-react';
import { haptic } from '@/components/telegram-ui';

export interface SkippedItem {
  id: string;
  reason: string;
  tier: string | null;
  job: { title: string; company: string; location: string | null; remote: boolean; url: string };
}

/** Jobs the free rule-based filter skipped, with "Score anyway". */
export function SkippedList({ items, reasons }: { items: SkippedItem[]; reasons: Array<{ reason: string; count: number }> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, number | string>>({});

  async function score(id: string) {
    setBusy(id);
    const res = await fetch(`/api/matches/${id}/score`, { method: 'POST' }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (res?.ok) haptic('success');
    else haptic('error');
    setDone((d) => ({ ...d, [id]: res?.ok ? data.score : data.error || 'Failed' }));
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        {reasons.slice(0, 10).map(({ reason: r, count: n }) => (
          <span key={r} className="rounded-full border border-line px-3 py-1 text-[12.5px] text-muted">{r} · <span className="tabular-nums">{n}</span></span>
        ))}
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line">
        {items.map((i) => {
          const result = done[i.id];
          return (
            <div key={i.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <a href={i.job.url} target="_blank" rel="noreferrer" className="block truncate text-[15px] font-medium tracking-[-0.01em] hover:text-accent">{i.job.title}</a>
                <p className="truncate text-[12.5px] text-muted">{i.job.company}{i.job.location ? ` · ${i.job.location}` : ''}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted"><span className="size-1.5 rounded-full bg-line-strong" />{i.reason}</p>
              </div>
              {typeof result === 'number' ? (
                <Link href={`/dashboard/matches/${i.id}`} className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-accent">{result} · open</Link>
              ) : result ? (
                <span className="max-w-[120px] shrink-0 text-right text-[12px] text-danger">{result}</span>
              ) : (
                <button type="button" onClick={() => score(i.id)} disabled={busy !== null} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] font-medium hover:border-accent disabled:opacity-40">
                  {busy === i.id ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-accent" />} Score anyway
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
