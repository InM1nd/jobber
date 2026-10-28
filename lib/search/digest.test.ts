import { describe, expect, it } from 'vitest';
import { candidateLevel, jobDigest, languageFit, requiredLevel, sections } from './digest';
import { calibrationBlock, decisionsFrom } from './calibration';

const blurb = 'Acme is a fast-growing logistics company founded in 2012 with offices in five countries. '.repeat(20);
const ad = `${blurb}
Your tasks
Build the shipment tracking UI in React.
Work with designers on a design system.

Your profile
5+ years of frontend experience with React and TypeScript.
Fluent English; German is a plus.

What we offer
Salary from €65,000 gross per year, hybrid in Vienna.
Free coffee and a nice office.`;

describe('job digest', () => {
  it('finds requirement and task sections by their headings', () => {
    expect(sections(ad).map((s) => s.kind)).toEqual(['intro', 'task', 'req', 'other']);
  });

  it('keeps the requirements and the salary line even after a long blurb', () => {
    const d = jobDigest(ad, 600);
    expect(d.length).toBeLessThanOrEqual(620);
    expect(d).toContain('5+ years of frontend experience');
    expect(d).toContain('shipment tracking UI');
    expect(d).toContain('€65,000');
    expect(d).not.toContain('Free coffee');
    // The old way (first 600 chars) would have been blurb only.
    expect(ad.slice(0, 600)).not.toContain('React');
  });

  it('returns short ads whole', () => {
    expect(jobDigest('React developer.\nRemote.', 600)).toBe('React developer. Remote.');
  });
});

describe('language levels', () => {
  it('reads the candidate’s level from CEFR or words', () => {
    expect(candidateLevel(['German (A2)'], 'german')).toBe(1);
    expect(candidateLevel(['German (Basic)'], 'german')).toBe(1);
    expect(candidateLevel(['English (Fluent)'], 'english')).toBe(4);
    expect(candidateLevel(['English (Fluent)'], 'german')).toBe(-1);
  });

  it('reads what the ad asks for, and whether it is optional', () => {
    expect(requiredLevel('Sehr gute Deutschkenntnisse (C1) sind Voraussetzung.', 'german')).toEqual({ level: 4, optional: false });
    expect(requiredLevel('German is a plus.', 'german')).toEqual({ level: 3, optional: true });
    expect(requiredLevel('Based in Deutschland, we ship across Germany.', 'german')).toBeNull();
    expect(requiredLevel('Fluent English required. German B1 nice to have.', 'english')).toEqual({ level: 4, optional: false });
  });

  it('scores the gap', () => {
    const a2 = ['English (Fluent)', 'German (A2)'];
    expect(languageFit(a2, 'Fluent English. German is a plus.')).toBe(75);
    expect(languageFit(['English (Fluent)', 'German (B1)'], 'German is a plus.')).toBe(88);
    expect(languageFit(a2, 'Gute Deutschkenntnisse (B2) erforderlich.')).toBe(35);
    expect(languageFit(a2, 'Deutsch C1 ist ein Muss.')).toBe(15);
    expect(languageFit(['English (Fluent)', 'German (C1)'], 'Deutsch C1 ist ein Muss.')).toBe(100);
    expect(languageFit(a2, 'React, TypeScript.')).toBe(100);
  });
});

describe('personal calibration', () => {
  it('takes the latest few decisions of each kind', () => {
    const d = decisionsFrom([
      { status: 'interview', role: 'Frontend Engineer', company: 'Bitpanda' },
      { status: 'skip', role: 'Backend Engineer (Go)', company: 'X' },
      { status: 'applied', role: 'Product Engineer', company: 'Storyblok' },
      { status: 'rejected', role: 'Ignored', company: 'Y' },
      { status: 'to_apply', role: 'Ignored too', company: 'Z' },
    ]);
    expect(d.map((x) => x.kind)).toEqual(['interview', 'skipped', 'applied']);
    expect(calibrationBlock(d)).toContain('- got an interview: Frontend Engineer — Bitpanda');
    expect(calibrationBlock(d.slice(0, 1))).toBe('');
  });
});
