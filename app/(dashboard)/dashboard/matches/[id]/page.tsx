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

      <header className="rounded-[var(--radius-card)] bg-[#111111] p-6 text-white dark:border dark:border-line dark:bg-[#121214]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] text-white/55">{match.job.company}</p>
            <h1 className="mt-1 text-[28px] font-semibold leading-[1.08] tracking-[-0.04em]">{match.job.title}</h1>
          </div>
          <ScoreRing score={match.score} size={56} className="[&>span]:text-white" />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-white/55">
          <span className={`font-semibold ${FIT_TEXT[fitOf(match.score)]}`}>{FIT_LABEL[fitOf(match.score)]}</span>
          {place && <span>· {place}</span>}
          {salary && <span>· {salary}</span>}
        </div>
        <a href={match.job.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-[14px] font-semibold transition-colors hover:bg-white/15">
          Open listing <ArrowUpRight className="size-4 text-accent" />
        </a>
      </header>

      {(match.reasons.length > 0 || match.redFlags.length > 0) && (
        <div className="space-y-2 px-1">
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
