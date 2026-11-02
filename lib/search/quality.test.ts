import { describe, expect, it } from 'vitest';
import { salvageResults } from './score';
import { scoringChanged } from './rescore';
import { decisionsFrom, calibrationBlock } from './calibration';
import { closesMissing } from '@/lib/jobs/ingest';
import { unhealthy } from '@/lib/jobs/health';
import { skipReasonOf, withSkipReason } from '@/lib/tracker/skip';
import { modelsFor } from '@/lib/ai/gemini';

describe('salvageResults', () => {
  it('keeps complete entries with nested requirements and drops the cut-off one', () => {
    const reply = '{"results":[{"id":"j1","roleFit":80,"skills":70,"cv":"A","reasons":["a {b}"],"redFlags":[],"requirements":[{"text":"React","must":true,"skill":"React"}]},{"id":"j2","roleFit":60,"requirements":[{"text":"Go","must":fa';
    const got = salvageResults(reply).results as Array<{ id: string }>;
    expect(got.map((r) => r.id)).toEqual(['j1']);
  });
  it('handles escaped quotes and trailing commas', () => {
    const reply = '{"results":[{"id":"j1","reasons":["say \\"hi\\" }"],},{"id":"j2","reasons":[]}';
    expect((salvageResults(reply).results as Array<{ id: string }>).map((r) => r.id)).toEqual(['j1', 'j2']);
  });
});

describe('closesMissing', () => {
  it('closes only on complete company boards', () => {
    expect(closesMissing('greenhouse', 12, 80)).toBe(true);
    expect(closesMissing('greenhouse', 0, 80)).toBe(false);
    expect(closesMissing('greenhouse', 80, 80)).toBe(false);
    expect(closesMissing('remotive', 12, 80)).toBe(false);
    expect(closesMissing('scrape:karriere', 12, 80)).toBe(false);
  });
});

describe('scoringChanged', () => {
  it('ignores order and non-scoring fields', () => {
    expect(scoringChanged({ skills: ['a', 'b'], alertThreshold: 70 }, { skills: ['b', 'a'], alertThreshold: 80 })).toBe(false);
    expect(scoringChanged({ seniority: 'mid' }, { seniority: 'senior' })).toBe(true);
    expect(scoringChanged({ location: 'Wien, Austria' }, { location: 'Graz, Austria' })).toBe(true);
  });
});

describe('skip reasons', () => {
  it('sets, replaces and clears one line', () => {
    const a = withSkipReason('Called HR', 'Level');
    expect(a).toBe('Skipped: Level\nCalled HR');
    const b = withSkipReason(a, 'Language');
    expect(skipReasonOf(b)).toBe('Language');
    expect(b.match(/Skipped:/g)?.length).toBe(1);
    expect(withSkipReason(b, null)).toBe('Called HR');
  });
  it('feeds calibration, reasoned skips first', () => {
    const d = decisionsFrom([
      { status: 'skip', role: 'A', company: 'X', notes: null },
      { status: 'skip', role: 'B', company: 'Y', notes: 'Skipped: Language' },
      { status: 'applied', role: 'C', company: 'Z' },
    ]);
    expect(d[0]).toMatchObject({ title: 'B', reason: 'Language' });
    expect(calibrationBlock(d)).toContain('skipped (not interested) because of language: B — Y');
  });
});

describe('source health', () => {
  const old = new Date(Date.now() - 30 * 86400000);
  it('flags failing, stale and empty sources, skips agent/new ones', () => {
    const now = Date.now();
    const bad = unhealthy(
      [
        { id: '1', company: 'Fail', sourceType: 'lever', lastError: '404', lastSuccessAt: old, createdAt: old },
        { id: '2', company: 'Stale', sourceType: 'lever', lastError: null, lastSuccessAt: old, createdAt: old },
        { id: '3', company: 'Empty', sourceType: 'lever', lastError: null, lastSuccessAt: new Date(now), createdAt: old },
        { id: '4', company: 'Ok', sourceType: 'lever', lastError: null, lastSuccessAt: new Date(now), createdAt: old },
        { id: '5', company: 'Grok', sourceType: 'agent', lastError: null, lastSuccessAt: null, createdAt: old },
        { id: '6', company: 'New', sourceType: 'lever', lastError: null, lastSuccessAt: null, createdAt: new Date(now) },
      ],
      new Map([['4', 3]]),
      now,
    );
    expect(bad.map((b) => b.company)).toEqual(['Fail', 'Stale', 'Empty']);
  });
});

describe('verify tier', () => {
  it('uses Flash only', () => {
    expect(modelsFor('verify')).toEqual([process.env.GEMINI_MODEL || 'gemini-3.5-flash']);
  });
});
