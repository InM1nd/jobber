import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ChevronLeft } from 'lucide-react';
import { TelegramBack } from '@/components/telegram-ui';
import { getMatch, getProfile, isOwner, requireUser } from '@/lib/data/service';
import { claudeConnectorOn, claudeLetterUrl } from '@/lib/agent/handoff';
import { MatchDetail } from '@/components/app/match-detail';
import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const user = await requireUser();
  if (!user) return null;
  const { id } = await params;
  const match = await getMatch(user.id, id);
  if (!match) notFound();

  const [profile, cvs] = await Promise.all([
    getProfile(user.id),
    isDemoMode() ? Promise.resolve([]) : getPrisma().cv.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, select: { id: true, label: true } }),
  ]);

  const claudeUrl = !isDemoMode() && claudeConnectorOn() && (await isOwner(user)) ? claudeLetterUrl(match.id, `${match.job.title} at ${match.job.company}`) : null;

  return (
    <div className="space-y-6">
      <TelegramBack href="/dashboard/matches" />
      <Link href="/dashboard/matches" className="-ml-1 inline-flex items-center gap-0.5 text-[13px] font-medium text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> Matches
      </Link>
      <MatchDetail match={match} profile={profile} cvs={cvs} claudeUrl={claudeUrl} />
    </div>
  );
}
