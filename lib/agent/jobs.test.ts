import { describe, expect, it } from 'vitest';
import { isComplete, MIN_DESCRIPTION, parseAgentJob } from './jobs';
import { parseAiMeta } from '@/lib/ai/meta';

const longText = 'Build the React front end of our booking product. '.repeat(5);

describe('parseAgentJob', () => {
  it('accepts a complete ad and normalizes fields', () => {
    const f = parseAgentJob({ title: ' Frontend Engineer ', company: 'Acme GmbH', description: longText, score: '87.4', source: 'Grok Bot', note: 'React + Vienna' });
    expect('error' in f).toBe(false);
    if ('error' in f) return;
    expect(f.title).toBe('Frontend Engineer');
    expect(f.score).toBe(87);
    expect(f.finder).toBe('grok-bot');
    expect(f.note).toBe('React + Vienna');
    expect(isComplete(f)).toBe(true);
  });

  it('defaults the finder and accepts role as title', () => {
    const f = parseAgentJob({ role: 'Dev', company: 'X', url: 'https://x.com/jobs/1' });
    if ('error' in f) throw new Error(f.error);
    expect(f.finder).toBe('grok');
    expect(f.title).toBe('Dev');
    expect(isComplete(f)).toBe(false);
  });

  it('needs a link, text, or a full ad', () => {
    expect(parseAgentJob({ title: 'Dev', company: 'X' })).toHaveProperty('error');
    expect(parseAgentJob(null)).toHaveProperty('error');
    expect(parseAgentJob({ text: 'paste' })).not.toHaveProperty('error');
  });

  it('treats a short description as incomplete', () => {
    const f = parseAgentJob({ title: 'Dev', company: 'X', description: 'x'.repeat(MIN_DESCRIPTION - 1), url: 'https://x.com/j/2' });
    if ('error' in f) throw new Error(f.error);
    expect(isComplete(f)).toBe(false);
  });

  it('ignores a score that is not a number and clamps the rest', () => {
    const a = parseAgentJob({ url: 'https://x.com/j/3', score: 'high' });
    const b = parseAgentJob({ url: 'https://x.com/j/3', score: 140 });
    if ('error' in a || 'error' in b) throw new Error('parse');
    expect(a.score).toBeUndefined();
    expect(b.score).toBe(100);
  });
});

describe('parseAiMeta agent', () => {
  it('keeps a valid agent find and drops junk', () => {
    expect(parseAiMeta({ agent: { by: 'grok', at: '2026-11-02T10:00:00Z', note: 'fits', score: 80 } }).agent).toEqual({ by: 'grok', at: '2026-11-02T10:00:00Z', note: 'fits', score: 80 });
    expect(parseAiMeta({ agent: { note: 'no finder' } }).agent).toBeUndefined();
  });
});
