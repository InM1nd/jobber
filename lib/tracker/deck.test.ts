import { describe, expect, it } from 'vitest';
import { undecided } from './deck';
import { cleanReason } from './decide';
import { parseAiMeta } from '@/lib/ai/meta';

describe('Review deck', () => {
  const now = Date.parse('2026-11-03T10:00:00Z');

  it('shows undecided cards and "later" ones whose time came', () => {
    expect(undecided({}, now)).toBe(true);
    expect(undecided({ swipe: { d: 'later', at: '2026-11-01T10:00:00Z', until: '2026-11-03T09:00:00Z' } }, now)).toBe(true);
    expect(undecided({ swipe: { d: 'later', at: '2026-11-02T10:00:00Z', until: '2026-11-05T10:00:00Z' } }, now)).toBe(false);
    expect(undecided({ swipe: { d: 'apply', at: '2026-11-02T10:00:00Z' } }, now)).toBe(false);
    expect(undecided({ swipe: { d: 'skip', at: '2026-11-02T10:00:00Z' } }, now)).toBe(false);
  });

  it('accepts only the known skip reasons', () => {
    expect(cleanReason('Level')).toBe('Level');
    expect(cleanReason(' Stack ')).toBe('Stack');
    expect(cleanReason('Because')).toBeUndefined();
    expect(cleanReason(3)).toBeUndefined();
  });

  it('round-trips the swipe in aiMeta and drops junk', () => {
    const swipe = { d: 'skip', at: '2026-11-02T10:00:00Z', reason: 'Language', prevFlags: ['German C1'] };
    expect(parseAiMeta({ swipe }).swipe).toEqual(swipe);
    expect(parseAiMeta({ swipe: { d: 'maybe', at: 'x' } }).swipe).toBeUndefined();
  });
});
