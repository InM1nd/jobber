import Link from 'next/link';
import { requireUser, getMatches } from '@/lib/data/service';
import { formatSalaryRange } from '@/lib/text';

export const instant = false;

export default async function MatchesPage() {
  const user = await requireUser();
  if (!user) return null;
  const matches = await getMatches(user.id);
  const groups = [
    ['High', matches.filter((match) => match.priority === 'high')],
    ['Medium', matches.filter((match) => match.priority === 'medium')],
    ['Low', matches.filter((match) => match.priority === 'low')],
  ] as const;

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Matches</h1>
        <p className="text-gray-600">{matches.length} scored vacancies. High is 80 and above.</p>
      </div>

      {matches.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-600">
          No matches yet. After the daily fetch, scoring runs with your own API key.
        </p>
      )}

      {groups.map(([label, items]) =>
        items.length === 0 ? null : (
          <section key={label} className="space-y-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
              {label} · {items.length}
            </h2>
            <div className="space-y-4">
              {items.map((match) => (
                <article key={match.id} className="space-y-4 rounded-xl border border-gray-200 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold">{match.job.title}</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        {match.job.company}
                        {match.job.location ? ` · ${match.job.location}` : ''}
                        {match.job.remote ? ' · Remote' : ''}
                      </p>
                    </div>
                    <p className="rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-800">
                      {match.score}
                    </p>
                  </div>
                  {formatSalaryRange(match.job.salaryMin, match.job.salaryMax, match.job.currency || 'EUR') && (
                    <p className="text-sm text-gray-600">
                      {formatSalaryRange(match.job.salaryMin, match.job.salaryMax, match.job.currency || 'EUR')}
                    </p>
                  )}
                  <ul className="space-y-1 text-sm text-gray-700">
                    {match.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  {match.redFlags.length > 0 && (
                    <ul className="space-y-1 text-sm text-amber-800">
                      {match.redFlags.map((flag) => (
                        <li key={flag}>{flag}</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <a className="text-green-700 underline" href={match.job.url} target="_blank" rel="noreferrer">
                      Listing
                    </a>
                    <Link className="text-green-700 underline" href={`/dashboard/matches/${match.id}`}>
                      Cover letter
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
