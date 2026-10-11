import type { JobSource, JobSourceConfig, RawJob } from '@/lib/sources/types';
import { PLATFORMS, scrapePlatform } from './platforms';

export const SCRAPER_TYPES = PLATFORMS.filter((p) => p.status === 'enabled').map((p) => `scrape:${p.id}`);

/** Feature flag: only on when OWNER_SCRAPERS=true AND the user is the owner. */
export function scrapersEnabledFor(user: { telegramId?: string | null } | null | undefined) {
  const owner = process.env.OWNER_TELEGRAM_ID?.trim();
  return process.env.OWNER_SCRAPERS === 'true' && Boolean(owner) && user?.telegramId === owner;
}

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
    return scrapePlatform(id, kw || '', city || 'wien');
  }
}

export { PLATFORMS };
