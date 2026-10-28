import { ArrowUpRight } from 'lucide-react';
import { LetterPanel } from '@/components/letter-panel';
import { TailorCv } from '@/components/tailor-cv';
import { RequirementsList } from '@/components/app/requirements-list';
import { refineChips } from '@/lib/apply/letter';
import { viaOf } from '@/lib/sources/via';
import { FIT_LABEL, FIT_TEXT, Note, ScoreRing, fitOf } from '@/components/ui/kit';
import { MatchMeta } from '@/components/app/match-card';
import { WEIGHTS } from '@/lib/search/rubric';
import { formatSalaryRange } from '@/lib/text';
import type { DemoMatch } from '@/lib/demo/store';

const SUB_LABEL: Record<string, string> = { role: 'Role fit', skills: 'Skills', seniority: 'Level', location: 'Location', language: 'Language', salary: 'Salary' };

/** Match detail body: shared by the mobile detail page and the desktop right-hand panel. */
export function MatchDetail({
  match,
  profile,
  cvs,
  claudeUrl,
}: {
  match: DemoMatch;
  /** "Write it with Claude" link when the Claude connector is on. */
  claudeUrl?: string | null;
  profile: { location?: string | null; country?: string | null };
  cvs: Array<{ id: string; label: string }>;
}) {
  const where = { city: profile.location?.split(',')[0]?.trim() || null, country: profile.country || profile.location?.split(',')[1]?.trim() || null };
  const sub = match.subScores;
  const salary = formatSalaryRange(match.job.salaryMin, match.job.salaryMax, match.job.currency || 'EUR');
  const place = [match.job.location, match.job.remote && !/remote/i.test(match.job.location || '') ? 'Remote' : null].filter(Boolean).join(' · ');
  return (
    <>
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
          {viaOf(match.job.description) && <span>· via {viaOf(match.job.description)}</span>}
          {salary && <span>· {salary}</span>}
        </div>
        <a href={match.job.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-[14px] font-semibold transition-colors hover:bg-white/15">
          Open listing <ArrowUpRight className="size-4 text-accent" />
        </a>
      </header>

      <MatchMeta match={match} place={where} className="-mt-2 px-1" />
      {match.cvLabel && cvs.length > 1 && (
        <p className="-mt-3 px-1 text-[13px] text-muted">Send your <span className="font-medium text-fg">{match.cvLabel}</span> CV for this one — it fits best of your {cvs.length}.</p>
      )}

      {sub && (
        <section className="rounded-[var(--radius-card)] border border-line px-5 py-4">
          <p className="mb-3 text-[14px] font-medium">Why {match.score}</p>
          <div className="space-y-2.5">
            {(Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).map((k) => (
              <div key={k} className="flex items-center gap-3 text-[13px]">
                <span className="w-[72px] shrink-0 text-muted">{SUB_LABEL[k]}</span>
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className={`absolute inset-y-0 left-0 rounded-full ${(sub[k] ?? 0) >= 75 ? 'bg-fit-strong' : (sub[k] ?? 0) >= 55 ? 'bg-fit-good' : (sub[k] ?? 0) >= 35 ? 'bg-fit-ok' : 'bg-fit-weak'}`} style={{ width: `${sub[k] ?? 0}%` }} />
                </span>
                <span className="w-7 shrink-0 text-right tabular-nums">{sub[k] ?? '–'}</span>
                <span className="w-8 shrink-0 text-right text-[11px] text-subtle">×{Math.round(WEIGHTS[k] * 100)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <RequirementsList items={match.requirements} />

      {(match.reasons.length > 0 || match.redFlags.length > 0) && (
        <div className="space-y-2 px-1">
          {match.reasons.map((r) => <Note key={r}>{r}</Note>)}
          {match.redFlags.map((f) => <Note key={f} tone="warning">{f}</Note>)}
        </div>
      )}

      <TailorCv matchId={match.id} initialAdvice={match.cvAdvice ?? null} initialCv={match.tailoredCv ?? null} cvs={cvs} cvId={match.cvId} initialMeta={match.aiMeta} />

      <LetterPanel
        matchId={match.id}
        initial={match.coverLetter}
        initialMeta={match.aiMeta?.letter}
        initialHistory={match.aiMeta?.letterHistory}
        chips={refineChips(match.requirements, match.job.company)}
        claudeUrl={claudeUrl}
      />

      <details className="group border-t border-line">
        <summary className="cursor-pointer list-none py-4 text-[14px] font-medium">
          Job description
        </summary>
        <p className="whitespace-pre-wrap pb-6 text-[14px] leading-6 text-muted">{match.job.description}</p>
      </details>
    </>
  );
}
