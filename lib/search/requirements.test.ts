import { describe, expect, it } from 'vitest';
import { blendSkills, classifyRequirements, coverageScore, gapNames, mentions, parseRequirements, sameSkill } from './requirements';
import { parseAiScores } from './rubric';

const skills = ['React', 'TypeScript', 'Next.js', 'Figma', 'Design systems'];
const cv = 'Frontend developer. Built a React + TypeScript component library and migrated the site to NextJS. Docker in CI.';

describe('requirement matching', () => {
  it('forgives spelling, not meaning', () => {
    expect(sameSkill('Next.js', 'nextjs')).toBe(true);
    expect(sameSkill('Design system', 'Design systems')).toBe(true);
    expect(sameSkill('React', 'React Native')).toBe(false);
    expect(mentions('I use React daily', 'react')).toBe(true);
    expect(mentions('Preact only', 'react')).toBe(false);
  });

  it('code decides covered / partial / gap; the model cannot add a skill', () => {
    const items = classifyRequirements(parseRequirements([
      { text: 'React and TypeScript', must: true, skill: 'react' },
      { text: 'Figma prototyping', must: false, skill: 'Figma' },
      { text: 'Docker', must: false, skill: 'Docker' },
      { text: 'Kubernetes', must: true, skill: 'Kubernetes' },
      { text: 'Go backend', must: true, skill: null },
    ]), skills, [cv]);
    expect(items.map((i) => [i.result, i.skill])).toEqual([
      ['covered', 'React'],
      ['partial', 'Figma'],
      ['partial', null],
      ['gap', null],
      ['gap', null],
    ]);
  });

  it('scores coverage with must-haves counting double and caps missing must-haves', () => {
    const items = classifyRequirements(parseRequirements([
      { text: 'React', must: true, skill: 'React' },
      { text: 'Go backend', must: true, skill: null },
      { text: 'Kafka streams', must: true, skill: null },
    ]), skills, [cv]);
    expect(coverageScore(items)).toBe(33);
    expect(blendSkills(90, items)).toBe(55);
    expect(blendSkills(90, items.slice(0, 2))).toBe(90); // too few to judge → model's number
    expect(gapNames(items)).toEqual(['Go backend', 'Kafka streams']);
  });

  it('parses requirements defensively from the batch reply', () => {
    const [s] = parseAiScores({ results: [{ id: 'j1', roleFit: 80, skills: 70, requirements: [{ text: 'React', skill: 'null' }, { text: '' }, 'junk'] }] });
    expect(s.requirements).toEqual([{ text: 'React', must: true, skill: null }]);
    const [t] = parseAiScores({ results: [{ id: 'j2', roleFit: 80, skills: 70 }] });
    expect(t.requirements).toEqual([]);
  });
});
