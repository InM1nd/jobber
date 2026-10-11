import axios from 'axios';
import { JobSource, RawJob, JobSourceConfig } from './types';
import { looksRemote, stripHtml } from './html';

export function parseGreenhouseJobs(data: unknown, company: string): RawJob[] {
  const jobs = (data as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(jobs)) return [];

  return jobs.map((entry) => {
    const job = entry as Record<string, any>;
    const location = job.location?.name ? String(job.location.name) : undefined;
    return {
      externalId: String(job.id),
      title: String(job.title || 'Untitled'),
      location,
      remote: looksRemote(location),
      description: stripHtml(String(job.content || '')),
      url: String(job.absolute_url || `https://boards.greenhouse.io/${company}/jobs/${job.id}`),
      postedAt: job.updated_at ? new Date(job.updated_at) : undefined,
    };
  });
}

export class GreenhouseSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const response = await axios.get(this.config.sourceUrl, { timeout: 20000 });
    return parseGreenhouseJobs(response.data, this.config.company);
  }
}
