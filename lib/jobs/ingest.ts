import type { JobSource as DbSource } from '@prisma/client';
import { getPrisma } from '@/lib/db/prisma';
import { jobUrlKey, makeDedupeKey } from './dedupe';
import { fetchJobsFromSource } from '@/lib/sources/factory';
import { SCRAPE_FRESH_MS } from '@/lib/scrapers';
import { JSEARCH_FRESH_MS } from '@/lib/sources/jsearch';

/** Fetches one source and upserts its jobs. Returns how many jobs it saw. */
export async function ingestSource(source: DbSource, maxJobs = 80): Promise<number> {
  const prisma = getPrisma();
  // Shared scraper rows: one fetch serves every allowed user; don't refetch inside the window.
  if (source.sourceType.startsWith('scrape:') && source.lastSuccessAt && Date.now() - source.lastSuccessAt.getTime() < SCRAPE_FRESH_MS) return 0;
  if (source.sourceType === 'manual') return 0;
  // JSearch costs the user's monthly requests: once a day is plenty.
  if (source.sourceType === 'jsearch' && source.lastFetchedAt && Date.now() - source.lastFetchedAt.getTime() < JSEARCH_FRESH_MS) return 0;
  try {
    const jobs = (
      await fetchJobsFromSource({
        company: source.company,
        sector: source.sector || undefined,
        sourceType: source.sourceType,
        sourceUrl: source.sourceUrl,
        careersUrl: source.careersUrl || undefined,
      })
    ).slice(0, maxJobs);

    // Batched: 2 lookups + 1 createMany + updates in one transaction (was 3 queries per job).
    const rows = jobs.map((job) => {
      const company = job.company || source.company;
      return {
        externalId: job.externalId,
        data: {
          company: job.company || null,
          title: job.title,
          location: job.location,
          remote: job.remote,
          description: job.description.slice(0, 20000),
          requirements: job.requirements,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          currency: job.currency,
          postedAt: job.postedAt && !Number.isNaN(job.postedAt.getTime()) ? job.postedAt : undefined,
          url: job.url,
          dedupeKey: makeDedupeKey(company, job.title, job.location),
          urlKey: jobUrlKey(job.url, source.sourceType),
        },
      };
    });
    const existing = new Set(
      (await prisma.job.findMany({ where: { sourceId: source.id, externalId: { in: rows.map((r) => r.externalId) } }, select: { externalId: true } })).map((j) => j.externalId),
    );
    const fresh = rows.filter((r) => !existing.has(r.externalId));
    // Same company + title + place, or the same posting link, already stored (from any source) = duplicate.
    const urlKeys = fresh.map((r) => r.data.urlKey).filter((k): k is string => Boolean(k));
    const known: Array<{ dedupeKey: string | null; urlKey: string | null }> = fresh.length
      ? await prisma.job.findMany({
          where: { OR: [{ dedupeKey: { in: fresh.map((r) => r.data.dedupeKey) } }, ...(urlKeys.length ? [{ urlKey: { in: urlKeys } }] : [])] },
          select: { dedupeKey: true, urlKey: true },
        })
      : [];
    const dupes = new Set(known.flatMap((j) => [j.dedupeKey, j.urlKey]).filter((k): k is string => Boolean(k)));
    const seen = new Set<string>();
    const isNew = (r: (typeof fresh)[number]) => {
      const keys = [r.data.dedupeKey, r.data.urlKey].filter((k): k is string => Boolean(k));
      if (keys.some((k) => dupes.has(k) || seen.has(k))) return false;
      keys.forEach((k) => seen.add(k));
      return true;
    };
    const toCreate = fresh.filter(isNew);
    if (toCreate.length) {
      await prisma.job.createMany({ data: toCreate.map((r) => ({ sourceId: source.id, externalId: r.externalId, ...r.data })), skipDuplicates: true });
    }
    const toUpdate = rows.filter((r) => existing.has(r.externalId));
    for (let i = 0; i < toUpdate.length; i += 25) {
      await prisma.$transaction(
        toUpdate.slice(i, i + 25).map((r) =>
          prisma.job.update({ where: { sourceId_externalId: { sourceId: source.id, externalId: r.externalId } }, data: { ...r.data, isActive: true } }),
        ),
      );
    }

    await prisma.jobSource.update({
      where: { id: source.id },
      data: { lastFetchedAt: new Date(), lastSuccessAt: new Date(), lastError: null },
    });
    return jobs.length;
  } catch (error) {
    await prisma.jobSource.update({
      where: { id: source.id },
      data: { lastFetchedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' },
    });
    return 0;
  }
}
