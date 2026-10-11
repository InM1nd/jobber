import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { FIT_BG, Note, ScoreRing, fitOf } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import type { DemoMatch } from '@/lib/demo/store';

export function isNew(match: DemoMatch, now = Date.now()) {
  return Boolean(match.createdAt && now - new Date(match.createdAt).getTime() < 24 * 3600 * 1000);
}

export function MatchRow({ match, now }: { match: DemoMatch; now: number }) {
  const place = [match.job.location, match.job.remote && !/remote/i.test(match.job.location || '') ? 'Remote' : null].filter(Boolean).join(' · ');
  const fit = fitOf(match.score);
  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      className="group relative flex items-start gap-3.5 py-4 pl-3 pr-1 transition-colors hover:bg-surface-2/60 active:bg-surface-2 md:rounded-[var(--radius-card)]"
    >
      <span className={cn('absolute bottom-4 left-0 top-4 w-[2px] rounded-full opacity-70', FIT_BG[fit])} aria-hidden />
      <ScoreRing score={match.score} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[15px] font-medium leading-snug">{match.job.title}</h3>
          {isNew(match, now) && (
            <span className="shrink-0 rounded-[4px] bg-accent-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent">New</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-muted">
          {match.job.company}
          {place ? ` · ${place}` : ''}
        </p>
        {match.reasons[0] && <p className="mt-1.5 line-clamp-1 text-[13px] text-fg/80">{match.reasons[0]}</p>}
        {match.redFlags[0] && <Note tone="warning" className="mt-1">{match.redFlags[0]}</Note>}
      </div>
      <ChevronRight className="mt-2 size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
