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
] as const;

export function isSupportedSourceType(type: string): boolean {
  return SUPPORTED_SOURCE_TYPES.includes(type.toLowerCase() as (typeof SUPPORTED_SOURCE_TYPES)[number]);
}

class UnsupportedSource implements JobSource {
  async fetch(): Promise<RawJob[]> {
    return [];
  }
}

export function createJobSource(config: JobSourceConfig): JobSource {
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
