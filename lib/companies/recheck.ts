import { getPrisma } from '@/lib/db/prisma';
import { detectCompany } from './detect';
import { boardUrl } from './seed';

const WEEK_MS = 7 * 24 * 3600 * 1000;

/**
 * Once a week: for careers-only ("manual") company sources, look for a public ATS
 * board linked from the careers page and switch the source to it if one answers with jobs.
 */
export async function recheckCareersOnly(opts: { force?: boolean } = {}) {
  const prisma = getPrisma();
  const mark = await prisma.cronJob.findUnique({ where: { name: 'careers-recheck' } });
  if (!opts.force && mark?.lastRunAt && Date.now() - mark.lastRunAt.getTime() < WEEK_MS) return null;
  const rows = await prisma.jobSource.findMany({
    where: { isActive: true, sourceType: 'manual', careersUrl: { not: null }, NOT: { sourceUrl: { startsWith: 'manual:' } } },
  });
  const results = await Promise.all(
    rows.map(async (s) => {
      try {
        const found = await Promise.race([
          detectCompany(s.careersUrl!),
          new Promise<null>((r) => setTimeout(() => r(null), 12_000)),
        ]);
        if (!found) return { company: s.company, upgraded: false };
        const sourceUrl = boardUrl(found);
        await prisma.jobSource.update({ where: { id: s.id }, data: { sourceType: found.ats, sourceUrl, lastFetchedAt: null, lastError: null } });
        return { company: s.company, upgraded: true, ats: found.ats, sourceUrl, jobs: found.jobs };
      } catch (e) {
        return { company: s.company, upgraded: false, error: (e as Error).message.slice(0, 100) };
      }
    }),
  );
  await prisma.cronJob.upsert({
    where: { name: 'careers-recheck' },
    create: { name: 'careers-recheck', lastRunAt: new Date(), lastStatus: 'success', lastError: JSON.stringify(results).slice(0, 2000) },
    update: { lastRunAt: new Date(), lastStatus: 'success', lastError: JSON.stringify(results).slice(0, 2000) },
  });
  return results;
}
