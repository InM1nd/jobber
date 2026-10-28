import { describe, expect, it } from 'vitest';
import { jobsFromHnPost, jobsFromThread, latestHiringThread, matchesKeyword } from './hackernews';

const post = (id: number, text: string) => ({ id, created_at: '2026-10-01T15:00:00.000Z', text });

describe('Hacker News “Who is hiring?”', () => {
  it('finds the newest hiring thread, not “Who wants to be hired?”', () => {
    expect(latestHiringThread({ hits: [
      { objectID: '3', title: 'Ask HN: Who wants to be hired? (October 2026)', created_at: '2026-10-01' },
      { objectID: '2', title: 'Ask HN: Who is hiring? (October 2026)', created_at: '2026-10-01' },
      { objectID: '1', title: 'Ask HN: Who is hiring? (September 2026)', created_at: '2026-09-01' },
    ] })).toBe('2');
  });

  it('turns a post into one job per role, with place, remote and the apply address', () => {
    const jobs = jobsFromHnPost(post(41, 'Acme (YC W24) | Senior Frontend Engineer, Product Designer | Vienna, Austria | Hybrid | €70k–90k<p>We build logistics software in React. Email jobs@acme.dev'));
    expect(jobs.map((j) => j.title)).toEqual(['Senior Frontend Engineer', 'Product Designer']);
    expect(jobs[0]).toMatchObject({ company: 'Acme', location: 'Vienna, Austria · Hybrid', remote: false, url: 'https://news.ycombinator.com/item?id=41', externalId: 'hn:41:0' });
    expect(jobs[0].description).toContain('Apply by email: jobs@acme.dev');
  });

  it('keeps remote posts without a role as “Open roles” and skips chatter', () => {
    const [job] = jobsFromHnPost(post(42, 'Tiller | REMOTE (EU) | Full-time<p>Hiring across the stack.'));
    expect(job).toMatchObject({ title: 'Open roles', remote: true, externalId: 'hn:42' });
    expect(jobsFromHnPost(post(43, 'Is this still open?'))).toEqual([]);
    expect(jobsFromThread({ children: [post(44, 'Abc | Frontend Developer | Remote'), { id: 45 }] })).toHaveLength(1);
  });

  it('filters by keyword as words', () => {
    const [job] = jobsFromHnPost(post(46, 'Acme | Frontend Engineer | Remote<p>React, TypeScript'));
    expect(matchesKeyword(job, 'react')).toBe(true);
    expect(matchesKeyword(job, 'frontend engineer')).toBe(true);
    expect(matchesKeyword(job, 'rust')).toBe(false);
  });
});
