import axios from 'axios';
import { JobSource, RawJob, JobSourceConfig } from './types';
import { looksRemote } from './html';

export function parseSmartRecruiters(data: unknown, company: string): RawJob[] {
  const content = (data as { content?: unknown[] })?.content;
  if (!Array.isArray(content)) return [];

  return content.map((entry) => {
    const job = entry as Record<string, any>;
    const city = job.location?.city || '';
    const country = job.location?.country || '';
    const location = [city, country].filter(Boolean).join(', ') || undefined;
    const remote = job.location?.remote === true || looksRemote(location);
    const id = String(job.id);
    return {
      externalId: id,
      title: String(job.name || 'Untitled'),
      location,
      remote,
      description: String(job.name || ''),
      url: String(job.ref || `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${id}`),
      postedAt: job.releasedDate ? new Date(job.releasedDate) : undefined,
    };
  });
}

export class SmartRecruitersSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const response = await axios.get(this.config.sourceUrl, { timeout: 20000 });
    return parseSmartRecruiters(response.data, this.config.company);
  }
}
