import { PLATFORMS, scraperSourceUrl, scrapersEnabledFor } from '@/lib/scrapers';
import { getPrisma } from '@/lib/db/prisma';
import { boardUrl } from '@/lib/companies/seed';
import { ensureBoardSources, ensureSourceRows, sourceSpecs } from './pipeline';
import { jsearchKeyFor, jsearchSourceUrl } from '@/lib/sources/jsearch';

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
  const rows = await prisma.jobSource.findMany({ where: { id: { in: profile.sourceIds }, OR: [{ sector: null }, { sector: { notIn: ['board', 'scrape', 'manual'] } }] } });
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
  const scraperIds = await ownerScraperSources(userId, keywords, profile.location);
  const jsearchIds = await jsearchSources(userId, keywords, where);
  // Keep the user's own "Added by you" source.
  const manual = await prisma.jobSource.findMany({ where: { id: { in: profile.sourceIds }, sector: 'manual' }, select: { id: true } });
  const sourceIds = [...new Set([...jsearchIds, ...scraperIds, ...companyIds, ...boardIds, ...manual.map((m) => m.id)])];
  await prisma.profile.update({ where: { userId }, data: { sourceIds, watchedCompanies: names } });
  return sourceIds;
}

/** JSearch (Google for Jobs: LinkedIn, Indeed…) for users with a key: two keywords, one row each, per user. */
async function jsearchSources(userId: string, keywords: string[], place: { city: string | null; country: string | null; remote: boolean }) {
  const on = process.env.JSEARCH_SOURCE !== 'off' && Boolean(await jsearchKeyFor(userId));
  const kws = on ? [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, Number(process.env.JSEARCH_KEYWORDS || 2)) : [];
  const ids = await ensureSourceRows(kws.map((k) => ({
    company: `JSearch · ${k}${place.city ? ` · ${place.city}` : ''}`,
    sourceType: 'jsearch',
    sourceUrl: jsearchSourceUrl(userId, k, place),
    sector: 'board',
  })));
  // Rows for old keywords or places would keep spending this user's requests: switch them off.
  await deactivateJSearch(userId, ids);
  return ids;
}

export async function deactivateJSearch(userId: string, keep: string[] = []) {
  await getPrisma().jobSource.updateMany({
    where: { sourceType: 'jsearch', sourceUrl: { endsWith: `#user=${userId}` }, isActive: true, ...(keep.length ? { id: { notIn: keep } } : {}) },
    data: { isActive: false },
  });
}

/** Allow-listed Austrian platform scrapers (OWNER_SCRAPERS=true + OWNER_TELEGRAM_ID or SCRAPER_TELEGRAM_IDS). */
async function ownerScraperSources(userId: string, keywords: string[], city?: string | null) {
  const user = await getPrisma().user.findUnique({ where: { id: userId }, select: { telegramId: true } });
  if (!scrapersEnabledFor(user)) return [];
  // Normalised so identical keyword+city queries map to ONE shared source row across users.
  const where = (city?.split(',')[0]?.trim() || 'Wien').toLowerCase().replace(/^vienna$/, 'wien');
  const kws = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
  const specs = kws.slice(0, 3).flatMap((k) =>
    PLATFORMS.filter((p) => p.status === 'enabled').map((p) => ({
      company: `${p.name} · ${k} · ${where}`,
      sourceType: `scrape:${p.id}`,
      sourceUrl: scraperSourceUrl(p.id, k, where),
      sector: 'scrape',
    })),
  );
  return ensureSourceRows(specs);
}

export { boardUrl };
