import { describe, expect, it } from 'vitest';
import { makeDedupeKey } from './dedupe';

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
