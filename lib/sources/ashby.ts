import axios from 'axios';
import { JobSource, RawJob, JobSourceConfig } from './types';
import { looksRemote, stripHtml } from './html';
import { parseSalaryRange } from './salary';

export function parseAshbyJobs(data: unknown, company: string): RawJob[] {
  const jobs = (data as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(jobs)) return [];

  return jobs.map((entry) => {
    const job = entry as Record<string, any>;
    const location = job.locationName || job.location ? String(job.locationName || job.location) : undefined;
    const compensation = parseSalaryRange(job.compensationTierSummary);
    const html = String(job.descriptionHtml || job.description || '');
    return {
      externalId: String(job.id),
      title: String(job.title || 'Untitled'),
      location,
      remote: looksRemote(location) || job.isRemote === true,
      description: stripHtml(html),
      salaryMin: compensation.min,
      salaryMax: compensation.max,
      currency: compensation.currency,
      url: String(job.jobUrl || `https://jobs.ashbyhq.com/${company}/${job.id}`),
      postedAt: job.publishedDate ? new Date(job.publishedDate) : undefined,
    };
  });
}

export class AshbySource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const response = await axios.get(this.config.sourceUrl, { timeout: 20000 });
    return parseAshbyJobs(response.data, this.config.company);
  }
}
