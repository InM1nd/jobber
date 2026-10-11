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
import { countSkipped, getMatches, getProfile, getSkipped, requireUser, skippedReasons } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';
import { MatchDetail } from '@/components/app/match-detail';
import { getPrisma } from '@/lib/db/prisma';

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
  const summary = matches.length
    ? [newCount ? `${newCount} new today` : null, strongCount ? `${strongCount} strong` : null, `${matches.length} total`].filter(Boolean).join(' · ')
    : 'New roles are scored every morning';

  const today = new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
  const headline = newCount || matches.length;

  const ordered = groups.flatMap((g) => g.items);
  const selected = ordered.find((m) => m.id === query.m) || ordered[0] || null;
  const cvs = selected && !demo
    ? await getPrisma().cv.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, select: { id: true, label: true } })
    : [];
  const sendable = matches.filter((m) => fitOf(m.score) === 'strong' || fitOf(m.score) === 'good').length;

  return (
    <div data-wide className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(440px,1.08fr)] lg:items-start lg:gap-8">
    <div className="min-w-0">
      <PageHeader
        eyebrow={today}
        eyebrowRight={matches.length ? <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-accent" />{strongCount} strong</span> : undefined}
        title={matches.length ? greeting : 'Matches'}
        subtitle={matches.length ? undefined : 'New roles are scored every morning'}
      />

      {activeRun && <SearchProgress initial={activeRun} className="mb-8" />}

      {!isDemoMode() && <AddJobLink />}

      {matches.length > 0 && (
        <div className="mb-6 hidden items-center gap-5 rounded-[var(--radius-card)] border border-line px-5 py-3.5 lg:flex">
          <span className="text-[30px] font-semibold leading-none tracking-[-0.05em] tabular-nums">{headline}</span>
          <span className="text-[13px] leading-tight text-muted">{newCount ? 'new' : 'roles'}<br />{newCount ? 'today' : 'scored'}</span>
          <span className="h-8 w-px bg-line" aria-hidden />
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
            <span className="inline-flex items-center gap-1.5"><FitDot fit="strong" />{strongCount} strong</span>
            <span className="text-muted">{sendable} worth applying</span>
            <span className="text-muted">{matches.length} total</span>
            {skippedCount > 0 && <Link href="/dashboard/matches?view=skipped" className="text-muted underline-offset-2 hover:text-fg hover:underline">{skippedCount} skipped</Link>}
          </span>
          {groups[0].items[0] && (
            <span className="ml-auto truncate text-[13px] text-muted">Top <span className="font-semibold text-accent">{groups[0].items[0].score}</span> {groups[0].items[0].job.company}</span>
          )}
        </div>
      )}

      {matches.length > 0 && (
        <div className="relative mb-9 pt-3 lg:hidden">
          <div className="absolute inset-x-5 top-0 h-10 rounded-[var(--radius-card)] border border-line bg-bg" aria-hidden />
          <div className="relative rounded-[var(--radius-card)] border border-line bg-bg px-6 py-6">
            <div className="flex items-end gap-4">
              <span className="text-[88px] font-semibold leading-[0.85] tracking-[-0.06em] tabular-nums">{headline}</span>
              <span className="pb-1 text-[16px] leading-tight text-muted">
                {newCount ? 'new roles' : 'roles'}<br />{newCount ? 'today' : 'scored'}
              </span>
            </div>
            <p className="mt-5 text-[16px] font-medium tracking-[-0.01em]">{summary}</p>
            {groups[0].items[0] && (
              <p className="mt-1 truncate text-[14px] text-muted">
                Top: <span className="text-accent">{groups[0].items[0].score}</span> {groups[0].items[0].job.title}, {groups[0].items[0].job.company}
              </p>
            )}
          </div>
        </div>
      )}

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
              <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line lg:hidden">
                {items.map((match) => <MatchRow key={match.id} match={match} now={now} place={place} />)}
              </div>
              <div className="hidden divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line lg:block">
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
            <span className="block text-[12.5px] text-muted">{hiddenLow ? `${hiddenLow} more hidden below your minimum score ${minScore}. ` : ''}See why, or score one anyway.</span>
          </span>
          <ChevronRight className="size-4 text-subtle" />
        </Link>
      )}
    </div>
    {selected && (
      <aside className="sticky top-6 hidden max-h-[calc(100vh-48px)] space-y-6 overflow-y-auto rounded-[var(--radius-card)] border border-line p-5 lg:block" aria-label="Selected match">
        <MatchDetail match={selected} profile={profile} cvs={cvs} />
      </aside>
    )}
    </div>
  );
}
