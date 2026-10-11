import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, ChevronLeft } from 'lucide-react';
import { LetterPanel } from '@/components/letter-panel';
import { TelegramBack } from '@/components/telegram-ui';
import { FIT_LABEL, FIT_TEXT, Note, ScoreRing, fitOf } from '@/components/ui/kit';
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
  const place = [match.job.location, match.job.remote && !/remote/i.test(match.job.location || '') ? 'Remote' : null].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      <TelegramBack href="/dashboard/matches" />
      <Link href="/dashboard/matches" className="-ml-1 inline-flex items-center gap-0.5 text-[13px] font-medium text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> Matches
      </Link>

      <header className="flex items-start gap-4">
        <ScoreRing score={match.score} size={52} />
        <div className="min-w-0">
        <p className="text-[13px] text-muted">{match.job.company}</p>
        <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em] md:text-[28px]">{match.job.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
          <span className={`font-medium ${FIT_TEXT[fitOf(match.score)]}`}>{FIT_LABEL[fitOf(match.score)]}</span>
          {place && <span>{place}</span>}
          {salary && <span>{salary}</span>}
          <a href={match.job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent underline-offset-4 hover:underline">
            Listing <ArrowUpRight className="size-3.5" />
          </a>
        </div>
        </div>
      </header>

      {(match.reasons.length > 0 || match.redFlags.length > 0) && (
        <div className="space-y-1.5 border-t border-line pt-5">
          {match.reasons.map((r) => <Note key={r}>{r}</Note>)}
          {match.redFlags.map((f) => <Note key={f} tone="warning">{f}</Note>)}
        </div>
      )}

      <LetterPanel matchId={match.id} initial={match.coverLetter} />

      <details className="group border-t border-line">
        <summary className="cursor-pointer list-none py-4 text-[14px] font-medium">
          Job description
        </summary>
        <p className="whitespace-pre-wrap pb-6 text-[14px] leading-6 text-muted">{match.job.description}</p>
      </details>
    </div>
  );
}
