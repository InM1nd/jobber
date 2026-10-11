import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Check, MapPin, PenLine, Wallet } from 'lucide-react';
import { Chip, ScoreBadge } from '@/components/ui/kit';
import { formatSalaryRange } from '@/lib/text';
import type { DemoMatch } from '@/lib/demo/store';

export function MatchCard({ match }: { match: DemoMatch }) {
  const salary = formatSalaryRange(match.job.salaryMin, match.job.salaryMax, match.job.currency || 'EUR');
  const place = [match.job.location, match.job.remote ? 'Remote' : null].filter(Boolean).join(' · ');
  return (
    <article className="group rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-soft transition-shadow hover:shadow-lift md:p-5">
      <Link href={`/dashboard/matches/${match.id}`} className="flex items-start gap-3.5">
        <ScoreBadge score={match.score} />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-muted">{match.job.company}</p>
          <h3 className="mt-0.5 text-[16px] font-semibold leading-snug tracking-[-0.01em]">{match.job.title}</h3>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-muted">
            {place && (
              <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{place}</span>
            )}
            {salary && (
              <span className="inline-flex items-center gap-1"><Wallet className="size-3.5" />{salary}</span>
            )}
          </div>
        </div>
      </Link>

      {(match.reasons.length > 0 || match.redFlags.length > 0) && (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {match.reasons.slice(0, 3).map((reason) => (
            <Chip key={reason} tone="success" icon={Check}>{reason}</Chip>
          ))}
          {match.redFlags.slice(0, 2).map((flag) => (
            <Chip key={flag} tone="warning" icon={AlertTriangle}>{flag}</Chip>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2 border-t border-line pt-3">
        <Link
          href={`/dashboard/matches/${match.id}`}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-accent-soft text-[13px] font-medium text-accent transition-colors hover:bg-accent/20"
        >
          <PenLine className="size-4" />
          {match.coverLetter ? 'View letter' : 'Write letter'}
        </Link>
        <a
          href={match.job.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-surface-2 text-[13px] font-medium text-fg transition-colors hover:bg-line-strong"
        >
          Listing <ArrowUpRight className="size-4" />
        </a>
      </div>
    </article>
  );
}
