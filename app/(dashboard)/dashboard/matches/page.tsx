import Link from 'next/link';
import { KeyRound, Sparkles, UserRound } from 'lucide-react';
import { MatchCard } from '@/components/app/match-card';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/kit';
import { getMatches, getProfile, listApiKeys, requireUser } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
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

  const groups = [
    { label: 'Strong match', items: matches.filter((m) => m.priority === 'high') },
    { label: 'Worth a look', items: matches.filter((m) => m.priority === 'medium') },
    { label: 'Long shots', items: matches.filter((m) => m.priority === 'low') },
  ];

  return (
    <div>
      <PageHeader
        title="Matches"
        subtitle={matches.length ? `${matches.length} roles scored against your profile` : 'New roles are scored every morning'}
      />

      {matches.length === 0 &&
        (!hasProfile ? (
          <EmptyState
            icon={UserRound}
            title="Tell Jobber what you’re looking for"
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

      <div className="space-y-7">
        {groups.map(({ label, items }) =>
          items.length === 0 ? null : (
            <section key={label} className="space-y-2.5">
              <h2 className="flex items-center gap-2 px-1 text-[12px] font-medium uppercase tracking-[0.06em] text-subtle">
                {label}
                <span className="rounded-full bg-surface-2 px-1.5 py-px text-[11px] tabular-nums text-muted">{items.length}</span>
              </h2>
              <div className="space-y-3">
                {items.map((match) => <MatchCard key={match.id} match={match} />)}
              </div>
            </section>
          ),
        )}
      </div>
    </div>
  );
}
