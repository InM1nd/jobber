import Link from 'next/link';
import { KeyRound, Sparkles, UserRound } from 'lucide-react';
import { MatchRow, isNew } from '@/components/app/match-card';
import { Button } from '@/components/ui/button';
import { EmptyState, FIT_LABEL, FitDot, PageHeader, fitOf, type Fit } from '@/components/ui/kit';
import { connection } from 'next/server';
import { getMatches, getProfile, listApiKeys, requireUser } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await connection();
  const user = await requireUser();
  if (!user) return null;
  const [allMatches, profile, keys, query] = await Promise.all([
    getMatches(user.id),
    getProfile(user.id),
    listApiKeys(user.id),
    searchParams,
  ]);
  // ?view=empty previews the first-run state in demo mode.
  const forceEmpty = isDemoMode() && query.view === 'empty';
  const matches = forceEmpty ? [] : allMatches;
  const hasProfile = !forceEmpty && Boolean(profile.cvText || profile.skills.length);
  const hasKey = !forceEmpty && keys.length > 0;

  const now = Date.now();
  const fits: Fit[] = ['strong', 'good', 'ok', 'weak'];
  const groups = fits.map((fit) => ({ fit, items: matches.filter((m) => fitOf(m.score) === fit) }));
  const newCount = matches.filter((m) => isNew(m, now)).length;
  const strongCount = groups[0].items.length;
  const summary = matches.length
    ? [newCount ? `${newCount} new today` : null, strongCount ? `${strongCount} strong` : null, `${matches.length} total`].filter(Boolean).join(' · ')
    : 'New roles are scored every morning';

  return (
    <div>
      <PageHeader
        title="Matches"
        subtitle={
          matches.length && newCount ? (
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 animate-pulse rounded-full bg-accent" />{summary}</span>
          ) : summary
        }
      />

      {matches.length === 0 &&
        (!hasProfile ? (
          <EmptyState
            icon={UserRound}
            title="Set up your profile"
            text="Add your CV and a few filters. Matches start arriving the next morning."
            action={<Button asChild><Link href="/dashboard/profile">Set up profile</Link></Button>}
          />
        ) : !hasKey ? (
          <EmptyState
            icon={KeyRound}
            title="Connect your AI"
            text="Scoring and letters run on your own OpenRouter or API key, so you stay in control of cost."
            action={<Button asChild><Link href="/dashboard/settings">Connect AI key</Link></Button>}
          />
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No matches yet"
            text="The next fetch runs tomorrow morning. You’ll get a Telegram message when something fits."
          />
        ))}

      <div className="space-y-8">
        {groups.map(({ fit, items }) =>
          items.length === 0 ? null : (
            <section key={fit}>
              <h2 className="flex items-center justify-between border-b border-line pb-2 text-[12px] font-medium text-muted">
                <span className="inline-flex items-center gap-2"><FitDot fit={fit} />{FIT_LABEL[fit]}</span>
                <span className="tabular-nums text-subtle">{items.length}</span>
              </h2>
              <div className="divide-y divide-line">
                {items.map((match) => <MatchRow key={match.id} match={match} now={now} />)}
              </div>
            </section>
          ),
        )}
      </div>
    </div>
  );
}
