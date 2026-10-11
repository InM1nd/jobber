import { describe, expect, it } from 'vitest';
import { parseGreenhouseJobs } from './greenhouse';
import { parseAshbyJobs } from './ashby';
import { parseLeverJobs } from './lever';
import { parseWorkableJobs } from './workable';
import { parsePersonioXml } from './personio';
import { parseRecruiteeOffers } from './recruitee';
import { parseRemotiveJobs } from './remotive';
import { parseJobRss } from './rss';
import { parseSmartRecruiters } from './smartrecruiters';
import { parseSalaryRange } from './salary';
import { isSupportedSourceType } from './factory';

describe('job source parsers', () => {
  it('parses Greenhouse jobs and strips HTML', () => {
    const jobs = parseGreenhouseJobs({
      jobs: [{
        id: 42,
        title: 'Frontend Engineer',
        absolute_url: 'https://boards.greenhouse.io/acme/jobs/42',
        location: { name: 'Remote - Europe' },
        updated_at: '2026-10-01T00:00:00.000Z',
        content: '<p>Build <strong>interfaces</strong></p>',
      }],
    }, 'acme');

    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalId).toBe('42');
    expect(jobs[0].remote).toBe(true);
    expect(jobs[0].description).toContain('Build');
    expect(jobs[0].description).not.toContain('<p>');
  });

  it('parses Ashby compensation in thousands', () => {
    const jobs = parseAshbyJobs({
      jobs: [{
        id: 'job_1',
        title: 'Design Engineer',
        locationName: 'Vienna',
        jobUrl: 'https://jobs.ashbyhq.com/acme/job_1',
        publishedDate: '2026-10-02',
        descriptionHtml: '<p>Design and code.</p>',
        compensationTierSummary: '€60k – €80k',
      }],
    }, 'acme');

    expect(jobs[0].salaryMin).toBe(60000);
    expect(jobs[0].salaryMax).toBe(80000);
    expect(jobs[0].currency).toBe('EUR');
    expect(jobs[0].remote).toBe(false);
  });

  it('parses a full euro range without multiplying twice', () => {
    expect(parseSalaryRange('€70,000 - €90,000')).toEqual({
      min: 70000,
      max: 90000,
      currency: 'EUR',
    });
  });

  it('parses Lever, Workable, Recruitee, and Remotive payloads', () => {
    expect(parseLeverJobs([{
      id: 'lev1',
      text: 'Product Engineer',
      categories: { location: 'Vienna, Austria' },
      descriptionPlain: 'Own a product surface.',
      hostedUrl: 'https://jobs.lever.co/acme/lev1',
      createdAt: 1760000000000,
    }])[0].title).toBe('Product Engineer');

    expect(parseWorkableJobs({
      jobs: [{
        shortcode: 'ABC',
        title: 'Frontend Developer',
        url: 'https://apply.workable.com/acme/j/ABC',
        location: { city: 'Vienna', country: 'Austria', telecommuting: false },
      }],
    })[0].location).toBe('Vienna, Austria');

    expect(parseRecruiteeOffers({
      offers: [{
        id: 7,
        title: 'Engineer',
        location: 'Vienna',
        description: '<p>Health product.</p>',
        careers_url: 'https://acme.recruitee.com/o/engineer',
      }],
    })[0].url).toContain('recruitee');

    expect(parseRemotiveJobs({
      jobs: [{
        id: 9,
        title: 'Frontend Engineer',
        company_name: 'Remote Co',
        candidate_required_location: 'Europe',
        description: 'Remote product work.',
        url: 'https://remotive.com/remote-jobs/9',
        publication_date: '2026-10-03',
      }],
    })[0].remote).toBe(true);
  });

  it('parses Personio XML', () => {
    const xml = `<?xml version="1.0"?>
      <workzag-jobs>
        <position>
          <id>15</id>
          <name>Frontend Engineer</name>
          <office>Vienna</office>
          <jobDescriptions>
            <jobDescription>
              <value><![CDATA[<p>Build the product.</p>]]></value>
            </jobDescription>
          </jobDescriptions>
        </position>
      </workzag-jobs>`;

    const jobs = parsePersonioXml(xml, 'Prewave');
    expect(jobs[0].title).toBe('Frontend Engineer');
    expect(jobs[0].description).toContain('Build the product');
    expect(jobs[0].externalId).toBe('15');
  });

  it('parses an RSS feed', async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Jobs</title>
          <item>
            <title>Platform Engineer</title>
            <link>https://careers.example.com/jobs/1</link>
            <pubDate>Thu, 01 Oct 2026 08:00:00 GMT</pubDate>
            <description>Remote friendly platform work.</description>
          </item>
        </channel>
      </rss>`;

    const jobs = await parseJobRss(xml, 'Spacelift');
    expect(jobs[0].title).toBe('Platform Engineer');
    expect(jobs[0].url).toBe('https://careers.example.com/jobs/1');
    expect(jobs[0].remote).toBe(true);
  });

  it('parses SmartRecruiters list items', () => {
    const jobs = parseSmartRecruiters({
      content: [{
        id: '99',
        name: 'Data Engineer',
        releasedDate: '2026-10-04T00:00:00.000Z',
        location: { city: 'Vienna', country: 'Austria', remote: false },
      }],
    }, 'Sportradar');

    expect(jobs[0].location).toBe('Vienna, Austria');
    expect(jobs[0].url).toContain('Sportradar');
  });

  it('knows which source types have an adapter', () => {
    expect(isSupportedSourceType('greenhouse')).toBe(true);
    expect(isSupportedSourceType('html')).toBe(false);
    expect(isSupportedSourceType('join')).toBe(false);
  });
});

import { parseArbeitnowJobs, parseHimalayasJobs, parseJobicyJobs, keywordSourceUrl } from './boards';

describe('keyword boards', () => {
  it('parses Jobicy with per-job company', () => {
    const [j] = parseJobicyJobs({ jobs: [{ id: 7, jobTitle: 'React Dev', companyName: 'Acme', jobGeo: 'Europe', jobDescription: '<p>Hi</p>', url: 'https://x/7' }] });
    expect(j).toMatchObject({ externalId: 'jobicy:7', company: 'Acme', remote: true, location: 'Remote (Europe)', description: 'Hi' });
  });
  it('parses Himalayas restrictions', () => {
    const [j] = parseHimalayasJobs({ jobs: [{ guid: 'g1', title: 'FE', companyName: 'B', locationRestrictions: ['Germany'], applicationLink: 'https://y', pubDate: 1700000000 }] });
    expect(j.location).toBe('Remote (Germany)');
    expect(j.postedAt?.getUTCFullYear()).toBe(2023);
  });
  it('filters Arbeitnow by keyword in title/tags', () => {
    const data = { data: [
      { slug: 'a', title: 'Frontend Engineer', company_name: 'A', url: 'https://a', tags: [] },
      { slug: 'b', title: 'Lagerist', company_name: 'B', url: 'https://b', tags: ['logistik'] },
      { slug: 'c', title: 'Engineer', company_name: 'C', url: 'https://c', tags: ['Front-End'] },
    ] };
    expect(parseArbeitnowJobs(data, 'frontend').map((j) => j.company)).toEqual(['A', 'C']);
  });
  it('builds keyword URLs', () => {
    expect(keywordSourceUrl('remotive', 'React Developer')).toBe('https://remotive.com/api/remote-jobs?search=react%20developer&limit=50');
  });
});
