import { describe, expect, it } from 'vitest';
import { factSources, unverifiedFacts } from './fact-guard';

const sources = factSources([
  'Frontend Developer & Designer at marswalk media, Vienna, since September 2025. Building for the web since 2021. React, TypeScript, Next.js.',
  'Available from 1 November 2026\nSalary expectation: €60,000–70,000 gross per year\nPortfolio: https://inm1nd.vercel.app',
  'Bitpanda is hiring a Frontend Engineer in Vienna to build investing interfaces.',
]);

describe('fact guard', () => {
  it('stays quiet about what the sources back, however it is written', () => {
    const text = 'At marswalk media I build with React and TypeScript. I can start on 1 November 2026, in Vienna. Salary: 60k–70k. Portfolio: https://inm1nd.vercel.app.';
    expect(unverifiedFacts(text, sources)).toEqual([]);
  });

  it('flags names, numbers, links and credentials nothing backs', () => {
    const text = 'I led a team of 8 at Google, grew conversion by 35% and I am AWS certified. See github.com/someone.';
    expect(unverifiedFacts(text, sources)).toEqual(['github.com/someone', 'Google', 'AWS', '8', '35%', 'certified']);
  });

  it('ignores sentence-start capitals, months, sign-offs and placeholders', () => {
    const text = 'Thanks for reading. Your product is great.\n\nBest,\nOleksandr [fill in: notice period of 3 months]';
    expect(unverifiedFacts(text, factSources(['Oleksandr']))).toEqual([]);
  });

  it('does not let short acronyms pass as substrings', () => {
    expect(unverifiedFacts('I shipped AI features.', factSources(['I maintain apps']))).toEqual(['AI']);
  });

  it('in German text checks acronyms and numbers, not every noun', () => {
    const de = 'Ich freue mich über die Stelle und bringe Erfahrung mit React mit. Die Arbeit mit Ihnen wäre für mich spannend, seit 2019 bei SAP.';
    expect(unverifiedFacts(de, sources)).toEqual(['SAP', '2019']);
  });
});
