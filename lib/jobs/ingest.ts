import type { JobSource as DbSource } from '@prisma/client';
import { getPrisma } from '@/lib/db/prisma';
import { makeDedupeKey } from './dedupe';
import { fetchJobsFromSource } from '@/lib/sources/factory';
import { SCRAPE_FRESH_MS } from '@/lib/scrapers';

/** Fetches one source and upserts its jobs. Returns how many jobs it saw. */
export async function ingestSource(source: DbSource, maxJobs = 80): Promise<number> {
  const prisma = getPrisma();
  // Shared scraper rows: one fetch serves every allowed user; don't refetch inside the window.
  if (source.sourceType.startsWith('scrape:') && source.lastSuccessAt && Date.now() - source.lastSuccessAt.getTime() < SCRAPE_FRESH_MS) return 0;
  if (source.sourceType === 'manual') return 0;
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

    for (const job of jobs) {
      const company = job.company || source.company;
      const dedupeKey = makeDedupeKey(company, job.title, job.location);
      const key = { sourceId_externalId: { sourceId: source.id, externalId: job.externalId } };
      const existing = await prisma.job.findUnique({ where: key, select: { id: true } });
      if (!existing) {
        const duplicate = await prisma.job.findFirst({ where: { dedupeKey }, select: { id: true } });
        if (duplicate) continue;
      }
      const data = {
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
        dedupeKey,
      };
      await prisma.job.upsert({
        where: key,
        create: { sourceId: source.id, externalId: job.externalId, ...data },
        update: { ...data, isActive: true },
      });
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
