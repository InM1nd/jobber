import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LetterPanel } from '@/components/letter-panel';
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

  return (
    <div className="space-y-8">
      <Link href="/dashboard/matches" className="text-sm text-gray-500 hover:text-gray-900">
        Back to matches
      </Link>
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Score {match.score} · {match.priority}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{match.job.title}</h1>
        <p className="text-gray-600">
          {match.job.company}
          {match.job.location ? ` · ${match.job.location}` : ''}
          {salary ? ` · ${salary}` : ''}
        </p>
      </div>
      <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 text-gray-800">{match.job.description}</p>
      <LetterPanel matchId={match.id} initial={match.coverLetter} />
    </div>
  );
}
