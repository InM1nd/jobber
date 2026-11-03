import { Sparkles, UserRound } from 'lucide-react';
import { redirect } from 'next/navigation';
import { SearchProgress } from '@/components/search-progress';
import { latestRun, runView } from '@/lib/search/pipeline';
import { MatchRow, isNew } from '@/components/app/match-card';
import { SkippedList } from '@/components/skipped-list';
import { AddJobLink } from '@/components/add-job-link';
import { TIER_ORDER } from '@/lib/jobs/prefilter';
import Link from 'next/link';
import { ChevronRight, Filter } from 'lucide-react';
import { EmptyState, FIT_LABEL, FitDot, PageHeader, CtaLink, capsClass, fitOf, type Fit } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { connection } from 'next/server';
import { countSkipped, getMatch, getMatches, getProfile, getSkipped, isOwner, requireUser, skippedReasons } from '@/lib/data/service';
import { claudeConnectorOn, claudeLetterUrl } from '@/lib/agent/handoff';
import { isDemoMode } from '@/lib/demo/mode';
import { MatchDetail } from '@/components/app/match-detail';
import { getPrisma } from '@/lib/db/prisma';
import { countDeck } from '@/lib/tracker/deck';

export const instant = false;

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ view?: string; m?: string }> }) {
  await connection();
  const user = await requireUser();
  if (!user) return null;
  const demo = isDemoMode();
  const [allMatches, profile, run, query, skippedCount] = await Promise.all([
    getMatches(user.id),
    getProfile(user.id),
    demo ? Promise.resolve(null) : latestRun(user.id),
    searchParams,
    countSkipped(user.id),
  ]);
  const place = { city: profile.location?.split(',')[0]?.trim() || null, country: profile.country || profile.location?.split(',')[1]?.trim() || null };

  if (query.view === 'skipped') {
    const [skipped, reasons] = await Promise.all([getSkipped(user.id), skippedReasons(user.id)]);
    return (
      <div>
        <PageHeader eyebrow={<Link href="/dashboard/matches" className="text-accent">← Matches</Link>} title="Skipped by filters" subtitle={`${skippedCount} jobs were ruled out or ranked below the AI cut, so no AI was spent on them. Disagree? Score one anyway.`} />
        <SkippedList items={skipped} reasons={reasons} />
      </div>
    );
  }
  // First-time users only have a CV: send them to the CV-first onboarding.
  if (!demo && !profile.onboardedAt && !profile.cvText && allMatches.length === 0) redirect('/dashboard/onboarding');
  const activeRun = run && (run.status === 'fetching' || run.status === 'scoring') ? runView(run) : null;
  // ?view=empty previews the first-run state in demo mode.
  const forceEmpty = demo && query.view === 'empty';
  const minScore = profile.minScore ?? 0;
  const matches = (forceEmpty ? [] : allMatches).filter((m) => m.score >= minScore);
  const hiddenLow = forceEmpty ? 0 : allMatches.length - matches.length;
  // Location priority inside each fit band: your city, then country, then remote.
  const tierRank = (t?: string | null) => TIER_ORDER[t || 'country'] ?? 1;
  matches.sort((a, b) => (fitOf(a.score) === fitOf(b.score) ? tierRank(a.locationTier) - tierRank(b.locationTier) || b.score - a.score : b.score - a.score));
  const hasProfile = !forceEmpty && Boolean(profile.cvText || profile.skills.length);

  const now = Date.now();
  const fits: Fit[] = ['strong', 'good', 'ok', 'weak'];
  const groups = fits.map((fit) => ({ fit, items: matches.filter((m) => fitOf(m.score) === fit) }));
  const newCount = matches.filter((m) => isNew(m, now)).length;
  const strongCount = groups[0].items.length;

  const ordered = groups.flatMap((g) => g.items);
  const selected = ordered.find((m) => m.id === query.m) || ordered[0] || null;
  // The list has no descriptions; load the full one only for the match shown in the side panel.
  const claudeOk = Boolean(selected) && !demo && claudeConnectorOn() && (await isOwner(user));
  const [cvs, selectedFull] = selected && !demo
    ? await Promise.all([
        getPrisma().cv.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, select: { id: true, label: true } }),
        getMatch(user.id, selected.id),
      ])
    : [[], selected];
  const sendable = matches.filter((m) => fitOf(m.score) === 'strong' || fitOf(m.score) === 'good').length;
  const summaryLine = [
    newCount ? `${newCount} new today` : null,
    strongCount ? `${strongCount} strong` : null,
    sendable ? `${sendable} worth applying` : null,
    `${matches.length} total`,
  ].filter(Boolean).join(' · ');
  const reviewCount = await countDeck(user.id, minScore);

  return (
    <div data-wide className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(460px,1.1fr)] xl:items-start xl:gap-8">
    <div className="min-w-0">
      <PageHeader
        title="Matches"
        subtitle={matches.length ? summaryLine : 'New roles are scored every morning and afternoon.'}
        action={reviewCount > 0 ? (
          <Link href="/dashboard/review" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-4 text-[14px] font-semibold text-accent-fg transition-transform active:scale-[0.98]">
            Review {reviewCount} <ChevronRight className="size-4" />
          </Link>
        ) : undefined}
      />

      {activeRun && <SearchProgress initial={activeRun} className="mb-8" />}

      {!isDemoMode() && <AddJobLink />}

      {matches.length === 0 &&
        (!hasProfile ? (
          <EmptyState
            icon={UserRound}
            title="Start with your CV"
            text="Upload it and Jobber finds matching jobs in a couple of minutes."
            action={<CtaLink href="/dashboard/onboarding">Upload CV</CtaLink>}
          />
        ) : activeRun ? null : (
          <EmptyState
            icon={Sparkles}
            title="No matches yet"
            text="The next fetch runs tomorrow morning. You’ll get a Telegram message when something fits."
            action={!demo ? <CtaLink href="/dashboard/onboarding">Update CV &amp; search</CtaLink> : undefined}
          />
        ))}

      <div className="space-y-8">
        {groups.map(({ fit, items }) =>
          items.length === 0 ? null : (
            <section key={fit}>
              <h2 className={cn(capsClass, 'mb-2.5 flex items-center justify-between px-1')}>
                <span className="inline-flex items-center gap-2"><FitDot fit={fit} />{FIT_LABEL[fit]}</span>
                <span className="tabular-nums">{items.length}</span>
              </h2>
              <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface xl:hidden">
                {items.map((match) => <MatchRow key={match.id} match={match} now={now} place={place} />)}
              </div>
              <div className="hidden divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface xl:block">
                {items.map((match) => (
                  <MatchRow key={match.id} match={match} now={now} place={place} compact href={`/dashboard/matches?m=${match.id}`} selected={match.id === selected?.id} />
                ))}
              </div>
            </section>
          ),
        )}
      </div>

      {(skippedCount > 0 || hiddenLow > 0) && (
        <Link href="/dashboard/matches?view=skipped" className="mt-8 flex items-center gap-3 rounded-[var(--radius-card)] border border-line px-5 py-4 transition-colors hover:bg-surface-2">
          <Filter className="size-4 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Skipped by filters · {skippedCount}</span>
            <span className="block text-[13.5px] text-muted">{hiddenLow ? `${hiddenLow} more hidden below your minimum score ${minScore}. ` : ''}See why, or score one anyway.</span>
          </span>
          <ChevronRight className="size-4 text-subtle" />
        </Link>
      )}
    </div>
    {selected && (
      <aside className="sticky top-6 hidden max-h-[calc(100vh-48px)] space-y-6 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-5 xl:block" aria-label="Selected match">
        <MatchDetail match={selectedFull || selected} profile={profile} cvs={cvs} claudeUrl={claudeOk ? claudeLetterUrl(selected.id, `${selected.job.title} at ${selected.job.company}`) : null} />
      </aside>
    )}
    </div>
  );
}
