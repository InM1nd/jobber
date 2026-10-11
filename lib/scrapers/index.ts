import type { JobSource, JobSourceConfig, RawJob } from '@/lib/sources/types';
import { PLATFORMS, scrapeDetail, scrapePlatform } from './platforms';
export { scrapeDetail };

export const SCRAPER_TYPES = PLATFORMS.filter((p) => p.status === 'enabled').map((p) => `scrape:${p.id}`);

/** Telegram ids allowed to use the scrapers: OWNER_TELEGRAM_ID + SCRAPER_TELEGRAM_IDS (comma-separated). */
export function scraperAllowlist() {
  return new Set(
    [process.env.OWNER_TELEGRAM_ID, ...(process.env.SCRAPER_TELEGRAM_IDS || '').split(',')]
      .map((x) => x?.trim())
      .filter((x): x is string => Boolean(x)),
  );
}

/** Feature flag: OWNER_SCRAPERS=true AND the user's Telegram id is on the allowlist. */
export function scrapersEnabledFor(user: { telegramId?: string | null } | null | undefined) {
  // Temporary: SCRAPER_ALLOW_ALL=true opens scrapers to every user (shared caps/cache still apply).
  // Revert: SCRAPER_ALLOW_ALL=false and list ids in SCRAPER_TELEGRAM_IDS.
  if (process.env.OWNER_SCRAPERS === 'true' && process.env.SCRAPER_ALLOW_ALL === 'true') return Boolean(user);
  return process.env.OWNER_SCRAPERS === 'true' && Boolean(user?.telegramId) && scraperAllowlist().has(user!.telegramId!);
}

/** Scraped sources are shared rows (same keyword+city => same row for all users); refetch at most this often. */
export const SCRAPE_FRESH_MS = Number(process.env.SCRAPER_FRESH_HOURS || 12) * 3600 * 1000;

export function scraperSourceUrl(platformId: string, keyword: string, city: string) {
  const p = PLATFORMS.find((x) => x.id === platformId)!;
  return `${p.searchUrl!(keyword, city)}#scrape`;
}

/** Adapter for the job-source factory. Refuses to run unless the global flag is on. */
export class ScraperSource implements JobSource {
  constructor(private config: JobSourceConfig) {}
  async fetch(): Promise<RawJob[]> {
    if (process.env.OWNER_SCRAPERS !== 'true') return [];
    const id = this.config.sourceType.replace(/^scrape:/, '');
    const [, kw, city] = this.config.company.split(' · ');
    // List page only: detail pages are fetched later, just for the top candidates (see enrichThin).
    return scrapePlatform(id, kw || '', city || 'wien', { details: Number(process.env.SCRAPER_LIST_DETAILS || 0) });
  }
}

export { PLATFORMS };
