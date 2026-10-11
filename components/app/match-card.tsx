import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Note, Score } from '@/components/ui/kit';
import type { DemoMatch } from '@/lib/demo/store';

export function MatchRow({ match }: { match: DemoMatch }) {
  const place = [match.job.location, match.job.remote && !/remote/i.test(match.job.location || '') ? 'Remote' : null].filter(Boolean).join(' · ');
  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      className="group flex items-start gap-3 py-4 transition-colors md:-mx-3 md:rounded-[var(--radius-card)] md:px-3 md:hover:bg-surface-2"
    >
      <Score score={match.score} className="pt-px" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-medium leading-snug">{match.job.title}</h3>
        <p className="mt-0.5 truncate text-[13px] text-muted">
          {match.job.company}
          {place ? ` · ${place}` : ''}
        </p>
        {match.reasons[0] && <p className="mt-1.5 line-clamp-1 text-[13px] text-fg/80">{match.reasons[0]}</p>}
        {match.redFlags[0] && <Note tone="warning" className="mt-1">{match.redFlags[0]}</Note>}
      </div>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
