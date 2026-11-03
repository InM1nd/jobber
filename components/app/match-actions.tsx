'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, X } from 'lucide-react';
import { haptic } from '@/components/telegram-ui';
import { SKIP_REASONS } from '@/lib/tracker/skip';
import { cn } from '@/lib/utils';

type State = 'open' | 'apply' | 'skip';

async function post(id: string, body: object) {
  const res = await fetch(`/api/matches/${id}/decide`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return Boolean(res?.ok);
}

/** Apply / Not for me on a match — the same decisions as Review, with Undo. */
export function MatchActions({ matchId, initial }: { matchId: string; initial?: 'apply' | 'skip' | 'later' | null }) {
  const router = useRouter();
  const [state, setState] = useState<State>(initial === 'apply' || initial === 'skip' ? initial : 'open');
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(next: State, body: object) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const prev = state;
    setState(next);
    haptic(next === 'apply' ? 'success' : 'light');
    const ok = await post(matchId, body);
    setBusy(false);
    if (!ok) {
      setState(prev);
      setError('Couldn’t save — try again.');
      haptic('error');
      return;
    }
    router.refresh();
  }

  async function pick(r: string) {
    const same = reason === r;
    setReason(same ? null : r);
    await post(matchId, { action: 'reason', reason: same ? null : r });
  }

  if (state === 'apply') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-accent/40 bg-accent/5 px-5 py-3.5">
        <Check className="size-5 text-accent" />
        <p className="min-w-0 flex-1 text-[14px] leading-snug">
          <span className="font-semibold">In your tracker.</span>{' '}
          <span className="text-muted">The letter and the apply link are coming to Telegram.</span>
        </p>
        <Link href="/dashboard/tracker" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-accent">Open tracker</Link>
        <button type="button" onClick={() => void run('open', { action: 'undo' })} className="inline-flex items-center gap-1 text-[13.5px] text-muted hover:text-fg">
          <RotateCcw className="size-3.5" /> Undo
        </button>
      </div>
    );
  }

  if (state === 'skip') {
    return (
      <div className="space-y-2.5 rounded-[var(--radius-card)] border border-line px-5 py-3.5">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-[14px]"><span className="font-semibold">Not for you.</span> <span className="text-muted">It’s out of Matches. Why? (teaches the scoring)</span></p>
          <button type="button" onClick={() => void run('open', { action: 'undo' })} className="inline-flex items-center gap-1 text-[13.5px] text-muted hover:text-fg">
            <RotateCcw className="size-3.5" /> Undo
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SKIP_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => void pick(r)} className={cn('h-8 rounded-full border px-3 text-[13.5px] font-medium', reason === r ? 'border-accent bg-accent/10' : 'border-line text-muted hover:bg-surface-2')}>
              {r}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('apply', { decision: 'apply' })}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-fg transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <Check className="size-4" /> I’ll apply
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('skip', { decision: 'skip' })}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line px-5 text-[15px] font-medium transition-colors hover:bg-surface-2 disabled:opacity-60"
        >
          <X className="size-4 text-fit-weak" /> Not for me
        </button>
      </div>
      {error && <p role="alert" className="text-[13px] text-fit-weak">{error}</p>}
    </div>
  );
}
