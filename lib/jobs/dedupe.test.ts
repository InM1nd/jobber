import { describe, expect, it } from 'vitest';
import { jobUrlKey, makeDedupeKey } from './dedupe';

describe('dedupe keys', () => {
  it('treats punctuation and case as the same vacancy', () => {
    const left = makeDedupeKey('Bitpanda', 'Front-end Engineer', 'Vienna, Austria');
    const right = makeDedupeKey('bitpanda', 'Front end Engineer', 'vienna austria');
    expect(left).toBe(right);
  });

  it('keeps a different title', () => {
    expect(makeDedupeKey('Bitpanda', 'Backend Engineer', 'Vienna')).not.toBe(
      makeDedupeKey('Bitpanda', 'Frontend Engineer', 'Vienna'),
    );
  });
});

describe('link dedupe', () => {
  it('drops tracking params and www, keeps the posting path', () => {
    expect(jobUrlKey('https://www.acme.com/jobs/123-frontend?utm_source=jobicy&gclid=x')).toBe(jobUrlKey('https://acme.com/jobs/123-frontend/'));
    expect(jobUrlKey('https://acme.com/jobs/123?id=5')).not.toBe(jobUrlKey('https://acme.com/jobs/123?id=6'));
  });
  it('ignores links that are not one posting', () => {
    expect(jobUrlKey('https://acme.com/careers')).toBeNull();
    expect(jobUrlKey('https://news.ycombinator.com/item?id=1', 'hackernews')).toBeNull();
    expect(jobUrlKey('https://board.example/search?q=react')).toBeNull();
    expect(jobUrlKey('not a url')).toBeNull();
  });
  it('treats accents as the same company', () => {
    expect(makeDedupeKey('Café Zürich GmbH', 'Frontend Engineer', 'Wien')).toBe(makeDedupeKey('cafe zurich', 'Frontend Engineer', 'Wien'));
  });
});
