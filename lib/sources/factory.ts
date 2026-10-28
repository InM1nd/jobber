import { JobSource, JobSourceConfig, RawJob } from './types';
import { GreenhouseSource } from './greenhouse';
import { AshbySource } from './ashby';
import { LeverSource } from './lever';
import { WorkableSource } from './workable';
import { PersonioSource } from './personio';
import { RecruiteeSource } from './recruitee';
import { RemotiveSource } from './remotive';
import { RssSource } from './rss';
import { SmartRecruitersSource } from './smartrecruiters';
import { KeywordBoardSource } from './boards';
import { MoreSource } from './more';
import { JoinSource } from './join';
import { HackerNewsSource } from './hackernews';
import { JSearchSource } from './jsearch';
import { SCRAPER_TYPES, ScraperSource } from '@/lib/scrapers';

export const SUPPORTED_SOURCE_TYPES = [
  'greenhouse',
  'ashby',
  'lever',
  'workable',
  'personio',
  'recruitee',
  'remotive',
  'rss',
  'teamtailor',
  'smartrecruiters',
  'jobicy',
  'himalayas',
  'arbeitnow',
  'remoteok',
  'weworkremotely',
  'workingnomads',
  'themuse',
  'bundesagentur',
  'adzuna',
  'jooble',
  'bamboohr',
  'workday',
  'join',
  'hackernews',
  'jsearch',
] as const;

export function isSupportedSourceType(type: string): boolean {
  if (SCRAPER_TYPES.includes(type) || type === 'manual') return true;
  return SUPPORTED_SOURCE_TYPES.includes(type.toLowerCase() as (typeof SUPPORTED_SOURCE_TYPES)[number]);
}

class UnsupportedSource implements JobSource {
  async fetch(): Promise<RawJob[]> {
    return [];
  }
}

export function createJobSource(config: JobSourceConfig): JobSource {
  if (config.sourceType.startsWith('scrape:')) return new ScraperSource(config);
  if (config.sourceType === 'manual') return { fetch: async () => [] };
  switch (config.sourceType.toLowerCase()) {
    case 'greenhouse':
      return new GreenhouseSource(config);
    case 'ashby':
      return new AshbySource(config);
    case 'lever':
      return new LeverSource(config);
    case 'workable':
      return new WorkableSource(config);
    case 'personio':
      return new PersonioSource(config);
    case 'recruitee':
      return new RecruiteeSource(config);
    case 'remotive':
      return new RemotiveSource(config);
    case 'rss':
    case 'teamtailor':
      return new RssSource(config);
    case 'smartrecruiters':
      return new SmartRecruitersSource(config);
    case 'join':
      return new JoinSource(config);
    case 'hackernews':
      return new HackerNewsSource(config);
    case 'jsearch':
      return new JSearchSource(config);
    case 'jobicy':
    case 'himalayas':
    case 'arbeitnow':
      return new KeywordBoardSource(config);
    case 'remoteok':
    case 'weworkremotely':
    case 'workingnomads':
    case 'themuse':
    case 'bundesagentur':
    case 'adzuna':
    case 'jooble':
    case 'bamboohr':
    case 'workday':
      return new MoreSource(config);
    default:
      return new UnsupportedSource();
  }
}

export async function fetchJobsFromSource(config: JobSourceConfig) {
  if (!isSupportedSourceType(config.sourceType)) {
    throw new Error(`No public API adapter for source type "${config.sourceType}"`);
  }
  const source = createJobSource(config);
  return source.fetch();
}
