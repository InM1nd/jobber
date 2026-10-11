import axios from 'axios';
import { JobSource, RawJob, JobSourceConfig } from './types';
import { looksRemote, stripHtml } from './html';

export function parseLeverJobs(data: unknown): RawJob[] {
  const jobs = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data;
  if (!Array.isArray(jobs)) return [];

  return jobs.map((entry) => {
    const job = entry as Record<string, any>;
    const location = job.categories?.location ? String(job.categories.location) : undefined;
    const workplace = job.workplaceType ? String(job.workplaceType) : '';
    const description = String(job.descriptionPlain || job.description || '');
    return {
      externalId: String(job.id),
      title: String(job.text || job.title || 'Untitled'),
      location,
      remote: looksRemote(location) || looksRemote(workplace),
      description: stripHtml(description),
      url: String(job.hostedUrl || job.applyUrl || ''),
      postedAt: job.createdAt ? new Date(job.createdAt) : undefined,
    };
  }).filter((job) => job.url);
}

export class LeverSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const response = await axios.get(this.config.sourceUrl, { timeout: 20000 });
    return parseLeverJobs(response.data);
  }
}
