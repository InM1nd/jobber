import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowUpRight, Check, ChevronLeft, MapPin, Wallet } from 'lucide-react';
import { LetterPanel } from '@/components/letter-panel';
import { TelegramBack } from '@/components/telegram-ui';
import { Chip, ScoreBadge } from '@/components/ui/kit';
import { getMatch, requireUser } from '@/lib/data/service';
import { formatSalaryRange } from '@/lib/text';

export const instant = false;

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return null;
  const { id } = await params;
  const match = await getMatch(user.id, id);
  if (!match) notFound();

  const salary = formatSalaryRange(match.job.salaryMin, match.job.salaryMax, match.job.currency || 'EUR');
  const place = [match.job.location, match.job.remote ? 'Remote' : null].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      <TelegramBack href="/dashboard/matches" />
      <Link href="/dashboard/matches" className="-ml-1 inline-flex items-center gap-0.5 text-[13px] font-medium text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> Matches
      </Link>

      <header className="flex items-start gap-4">
        <ScoreBadge score={match.score} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted">{match.job.company}</p>
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] md:text-[26px]">{match.job.title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted">
            {place && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{place}</span>}
            {salary && <span className="inline-flex items-center gap-1"><Wallet className="size-3.5" />{salary}</span>}
            <a href={match.job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent">
              Listing <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </div>
      </header>

      {(match.reasons.length > 0 || match.redFlags.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {match.reasons.map((r) => <Chip key={r} tone="success" icon={Check}>{r}</Chip>)}
          {match.redFlags.map((f) => <Chip key={f} tone="warning" icon={AlertTriangle}>{f}</Chip>)}
        </div>
      )}

      <LetterPanel matchId={match.id} initial={match.coverLetter} />

      <details className="group rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">
        <summary className="cursor-pointer list-none px-4 py-3.5 text-[14px] font-medium">
          Job description
        </summary>
        <p className="whitespace-pre-wrap border-t border-line px-4 py-4 text-[14px] leading-6 text-muted">{match.job.description}</p>
      </details>
    </div>
  );
}
