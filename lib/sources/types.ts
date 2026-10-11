export interface RawJob {
  externalId: string;
  /** Set by aggregators where each job has its own employer. */
  company?: string;
  title: string;
  location?: string;
  remote: boolean;
  description: string;
  requirements?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  postedAt?: Date;
  url: string;
}

export interface JobSourceConfig {
  company: string;
  sector?: string;
  sourceType: string;
  sourceUrl: string;
  careersUrl?: string;
}

export interface JobSource {
  fetch(): Promise<RawJob[]>;
}
