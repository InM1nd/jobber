import { getPrisma } from '@/lib/db/prisma';
import { boardUrl } from '@/lib/companies/seed';
import { ensureBoardSources, ensureSourceRows, sourceSpecs } from './pipeline';

export interface WatchCompany {
  name: string;
  ats: string;
  slug: string;
}

function place(p: { location: string | null; country: string | null; openTo: string[]; remoteOnly: boolean }) {
  const city = (p.location || '').split(',')[0]?.trim() || null;
  return { city, country: p.country || (p.location || '').split(',')[1]?.trim() || null, remote: p.openTo.length ? p.openTo.includes('remote') : true };
}

/** Current companies on the watch list (company sources among the user's sources). */
export async function watchList(userId: string) {
  const prisma = getPrisma();
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile?.sourceIds.length) return [];
  const rows = await prisma.jobSource.findMany({ where: { id: { in: profile.sourceIds }, NOT: { sector: 'board' } } });
  return rows.map((r) => ({ id: r.id, name: r.company, ats: r.sourceType, url: r.sourceUrl, lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null }));
}

/**
 * Rebuilds profile.sourceIds = keyword boards (from keywords + place) + the
 * given companies (or the current watch list), ordered city → country → remote.
 */
export async function rebuildSources(userId: string, companies?: Array<WatchCompany & { cities?: string[]; countries?: string[] }>) {
  const prisma = getPrisma();
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) return [];
  const where = place(profile);
  const keywords = profile.searchKeywords.length ? profile.searchKeywords : profile.targetRoles;
  const boardIds = await ensureBoardSources(keywords, where);
  let companyIds: string[];
  let names: string[];
  if (companies) {
    const specs = sourceSpecs(
      companies.map((c) => ({ name: c.name, ats: c.ats as never, slug: c.slug, cities: c.cities || [], countries: c.countries || [], tags: [] })),
      [],
      where,
    );
    companyIds = await ensureSourceRows(specs);
    names = companies.map((c) => c.name);
  } else {
    const current = await watchList(userId);
    companyIds = current.map((c) => c.id);
    names = current.map((c) => c.name);
  }
  const local = boardIds.slice(0, 0);
  void local;
  const sourceIds = [...new Set([...companyIds, ...boardIds])];
  await prisma.profile.update({ where: { userId }, data: { sourceIds, watchedCompanies: names } });
  return sourceIds;
}

export { boardUrl };
