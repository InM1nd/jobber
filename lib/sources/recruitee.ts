import axios from 'axios';
import { JobSource, RawJob, JobSourceConfig } from './types';
import { looksRemote, stripHtml } from './html';

export function parseRecruiteeOffers(data: unknown): RawJob[] {
  const offers = (data as { offers?: unknown[] })?.offers;
  if (!Array.isArray(offers)) return [];

  return offers.map((entry) => {
    const job = entry as Record<string, any>;
    const location = job.location ? String(job.location) : job.city ? String(job.city) : undefined;
    return {
      externalId: String(job.id || job.slug),
      title: String(job.title || 'Untitled'),
      location,
      remote: job.remote === true || looksRemote(location),
      description: stripHtml(String(job.description || job.requirements || '')),
      url: String(job.careers_url || job.url || ''),
      postedAt: job.published_at ? new Date(job.published_at) : undefined,
    };
  }).filter((job) => job.url);
}

export class RecruiteeSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const response = await axios.get(this.config.sourceUrl, { timeout: 20000 });
    return parseRecruiteeOffers(response.data);
  }
}
