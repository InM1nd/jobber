import axios from 'axios';
import { JobSource, RawJob, JobSourceConfig } from './types';
import { stripHtml } from './html';

export function parseRemotiveJobs(data: unknown): RawJob[] {
  const jobs = (data as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(jobs)) return [];

  return jobs.map((entry) => {
    const job = entry as Record<string, any>;
    const company = String(job.company_name || 'Unknown');
    const location = job.candidate_required_location ? String(job.candidate_required_location) : 'Remote';
    return {
      externalId: `${company}:${job.id}`,
      title: String(job.title || 'Untitled'),
      location,
      remote: true,
      description: stripHtml(String(job.description || '')),
      url: String(job.url || ''),
      postedAt: job.publication_date ? new Date(job.publication_date) : undefined,
    };
  }).filter((job) => job.url);
}

export class RemotiveSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const response = await axios.get(this.config.sourceUrl, { timeout: 20000 });
    return parseRemotiveJobs(response.data).map((job) => ({
      ...job,
      externalId: job.externalId,
    }));
  }
}
