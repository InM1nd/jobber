import Link from 'next/link';
import { ChevronRight, FileText, Globe2, MapPin, Plane } from 'lucide-react';
import { FIT_BG, Note, ScoreRing, fitOf } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import type { DemoMatch } from '@/lib/demo/store';

export function isNew(match: DemoMatch, now = Date.now()) {
  return Boolean(match.createdAt && now - new Date(match.createdAt).getTime() < 24 * 3600 * 1000);
}

export function tierView(tier: string | null | undefined, place: { city?: string | null; country?: string | null }) {
  switch (tier) {
    case 'city':
      return { icon: MapPin, label: place.city || 'Your city', strong: true };
    case 'country':
      return { icon: MapPin, label: place.country ? `In ${place.country}` : 'Your country', strong: false };
    case 'remote':
      return { icon: Globe2, label: 'Remote', strong: false };
    case 'relocation':
      return { icon: Plane, label: 'Relocation', strong: false };
    default:
      return null;
  }
}

export function MatchMeta({ match, place, className }: { match: DemoMatch; place: { city?: string | null; country?: string | null }; className?: string }) {
  const tier = tierView(match.locationTier, place);
  if (!tier && !match.cvLabel) return null;
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 overflow-hidden', className)}>
      {tier && (
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium', tier.strong ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted')}>
          <tier.icon className="size-3" /> {tier.label}
        </span>
      )}
      {match.cvLabel && (
        <span className="inline-flex min-w-0 max-w-[150px] items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-medium text-muted" title={`Use your ${match.cvLabel} CV`}>
          <FileText className="size-3 shrink-0" /> <span className="truncate">{match.cvLabel}</span>
        </span>
      )}
    </div>
  );
}

export function MatchRow({ match, now, place = {} }: { match: DemoMatch; now: number; place?: { city?: string | null; country?: string | null } }) {
  const where = [match.job.location, match.job.remote && !/remote/i.test(match.job.location || '') ? 'Remote' : null].filter(Boolean).join(' · ');
  const fit = fitOf(match.score);
  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      className="group relative flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-surface-2/70 active:bg-surface-2"
    >
      <span className={cn('absolute bottom-5 left-0 top-5 w-[3px] rounded-r-full', FIT_BG[fit])} aria-hidden />
      <ScoreRing score={match.score} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[16px] font-semibold leading-snug tracking-[-0.02em]">{match.job.title}</h3>
          {isNew(match, now) && (
            <span className="shrink-0 rounded-[4px] bg-accent-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent">New</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[14px] text-muted">
          {match.job.company}
          {where ? ` · ${where}` : ''}
        </p>
        <MatchMeta match={match} place={place} className="mt-2" />
        {match.reasons[0] && <p className="mt-2 line-clamp-1 text-[14px] text-fg/85">{match.reasons[0]}</p>}
        {match.redFlags[0] && <Note tone="warning" className="mt-1">{match.redFlags[0]}</Note>}
      </div>
      <ChevronRight className="mt-2 size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
