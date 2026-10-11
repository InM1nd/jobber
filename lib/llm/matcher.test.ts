import { describe, expect, it } from 'vitest';
import {
  buildCoverLetterMessages,
  buildMatchMessages,
  parseMatchResponse,
  priorityFromScore,
} from './matcher';

const profile = {
  cvText: 'Product engineer in Vienna since 2021.',
  skills: ['TypeScript', 'React'],
  location: 'Vienna',
  remoteOnly: false,
  languages: ['English'],
  salaryMin: 60000,
  salaryMax: 75000,
  stackKeywords: ['Frontend'],
  skillGaps: ['Vue', 'Java'],
  writingRules: '120 to 200 words. Do not invent facts.',
};

const job = {
  title: 'Frontend Engineer',
  company: 'Bitpanda',
  location: 'Vienna',
  remote: false,
  description: 'Build investing interfaces.',
};

describe('match parsing', () => {
  it('reads JSON wrapped in prose', () => {
    const result = parseMatchResponse(`Here you go:
    {
      "score": 86.2,
      "reasons": ["Vienna", "React"],
      "redFlags": ["Salary missing"],
      "priority": "high"
    }`);

    expect(result.score).toBe(86);
    expect(result.priority).toBe('high');
    expect(result.reasons).toEqual(['Vienna', 'React']);
  });

  it('derives priority when the model omits it', () => {
    const result = parseMatchResponse('{"score":40,"reasons":["weak"],"redFlags":[]}');
    expect(result.priority).toBe('low');
    expect(priorityFromScore(80)).toBe('high');
    expect(priorityFromScore(50)).toBe('medium');
  });

  it('rejects a response that is not a score', () => {
    expect(() => parseMatchResponse('not json')).toThrow(/JSON/);
    expect(() => parseMatchResponse('{"score":"high"}')).toThrow(/Invalid/);
  });

  it('puts skill gaps and honesty rules into the prompts', () => {
    const matchPrompt = buildMatchMessages(profile, job).map((message) => message.content).join('\n');
    expect(matchPrompt).toContain('Vue');
    expect(matchPrompt).toContain('Do not invent');
    expect(matchPrompt).toContain('Bitpanda');

    const letterPrompt = buildCoverLetterMessages(profile, job).map((message) => message.content).join('\n');
    expect(letterPrompt).toContain('Never invent facts');
    expect(letterPrompt).toContain('120 to 200 words');
    expect(letterPrompt).toContain('Do not claim: Vue, Java');
  });
});
