import axios from 'axios';
import { JobSource, RawJob, JobSourceConfig } from './types';
import { looksRemote, stripHtml } from './html';

export function parseWorkableJobs(data: unknown): RawJob[] {
  const jobs = (data as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(jobs)) return [];

  return jobs.map((entry) => {
    const job = entry as Record<string, any>;
    const city = job.location?.city || job.location?.location_str || '';
    const country = job.location?.country || '';
    const location = [city, country].filter(Boolean).join(', ') || undefined;
    const remote = job.location?.telecommuting === true || looksRemote(location);
    return {
      externalId: String(job.shortcode || job.id),
      title: String(job.title || 'Untitled'),
      location,
      remote,
      description: stripHtml(String(job.description || job.title || '')),
      url: String(job.url || job.application_url || ''),
      postedAt: job.created_at || job.published_on ? new Date(job.created_at || job.published_on) : undefined,
    };
  }).filter((job) => job.url);
}

export class WorkableSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const response = await axios.get(this.config.sourceUrl, { timeout: 20000 });
    return parseWorkableJobs(response.data);
  }
}
