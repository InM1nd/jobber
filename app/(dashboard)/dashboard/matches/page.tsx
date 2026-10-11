import { Sparkles, UserRound } from 'lucide-react';
import { redirect } from 'next/navigation';
import { SearchProgress } from '@/components/search-progress';
import { latestRun, runView } from '@/lib/search/pipeline';
import { MatchRow, isNew } from '@/components/app/match-card';
import { EmptyState, FIT_LABEL, FitDot, PageHeader, CtaLink, capsClass, fitOf, type Fit } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { connection } from 'next/server';
import { getMatches, getProfile, requireUser } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await connection();
  const user = await requireUser();
  if (!user) return null;
  const demo = isDemoMode();
  const [allMatches, profile, run, query] = await Promise.all([
    getMatches(user.id),
    getProfile(user.id),
    demo ? Promise.resolve(null) : latestRun(user.id),
    searchParams,
  ]);
  // First-time users only have a CV: send them to the CV-first onboarding.
  if (!demo && !profile.onboardedAt && !profile.cvText && allMatches.length === 0) redirect('/dashboard/onboarding');
  const activeRun = run && (run.status === 'fetching' || run.status === 'scoring') ? runView(run) : null;
  // ?view=empty previews the first-run state in demo mode.
  const forceEmpty = demo && query.view === 'empty';
  const matches = forceEmpty ? [] : allMatches;
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

  return (
    <div>
      <PageHeader
        eyebrow={today}
        eyebrowRight={matches.length ? <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-accent" />{strongCount} strong</span> : undefined}
        title={matches.length ? greeting : 'Matches'}
        subtitle={matches.length ? undefined : 'New roles are scored every morning'}
      />

      {activeRun && <SearchProgress initial={activeRun} className="mb-8" />}

      {matches.length > 0 && (
        <div className="relative mb-9 pt-3">
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
              <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line">
                {items.map((match) => <MatchRow key={match.id} match={match} now={now} />)}
              </div>
            </section>
          ),
        )}
      </div>
    </div>
  );
}
