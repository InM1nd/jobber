import { describe, expect, it } from 'vitest';
import { prefilterJob, roleTerms, type PrefilterProfile } from './prefilter';

const alex: PrefilterProfile = {
  targetRoles: ['Frontend Engineer', 'Senior React Developer'],
  keywords: ['react', 'frontend'],
  skills: ['React', 'TypeScript', 'Next.js'],
  location: 'Vienna, Austria',
  remoteOnly: false,
  languages: ['English (C1)', 'Russian (native)'],
  seniority: 'mid',
};
const job = (over: Partial<{ title: string; location: string | null; remote: boolean; description: string }>) => ({
  title: 'Frontend Engineer', location: 'Vienna, Austria', remote: false, description: 'We build with React and TypeScript.', ...over,
});

describe('prefilterJob', () => {
  it('passes a matching local role and ranks skill overlap', () => {
    const r = prefilterJob(alex, job({}));
    expect(r.pass).toBe(true);
    expect(r.relevance).toBeGreaterThan(3);
  });

  it('normalises front-end / React.js spellings', () => {
    expect(prefilterJob(alex, job({ title: 'Front-End Developer (React.js)' })).pass).toBe(true);
    expect(roleTerms(alex)).toContain('frontend');
  });

  it('drops unrelated titles', () => {
    expect(prefilterJob(alex, job({ title: 'Account Executive DACH' }))).toMatchObject({ pass: false });
  });

  it('drops roles that are too senior or too junior', () => {
    expect(prefilterJob(alex, job({ title: 'Principal Frontend Engineer' })).reason).toBe('Too senior');
    expect(prefilterJob({ ...alex, seniority: 'senior' }, job({ title: 'Frontend Developer Intern (Werkstudent)' })).reason).toBe('Too junior');
  });

  it('drops German-required or German-language vacancies when the user has no German', () => {
    expect(prefilterJob(alex, job({ description: 'React. Fließende Deutschkenntnisse (C1) sind erforderlich.' })).reason).toBe('Requires fluent German');
    const german = 'Wir suchen dich und deine Erfahrung mit React. Bei uns findest du eine Aufgaben mit Kenntnisse für uns und wir und sie mit dein Team. Wir bieten dir und uns eine Stelle mit für die Zukunft bei uns.';
    expect(prefilterJob(alex, job({ description: german })).reason).toBe('Vacancy is in German');
    expect(prefilterJob({ ...alex, languages: ['German (C1)'] }, job({ description: german })).pass).toBe(true);
  });

  it('handles on-site, remote and region-locked remote', () => {
    expect(prefilterJob(alex, job({ location: 'Berlin, Germany' })).reason).toBe('On-site in another country');
    expect(prefilterJob(alex, job({ location: 'Wien' })).pass).toBe(true);
    expect(prefilterJob({ ...alex, remoteOnly: true }, job({})).reason).toBe('Not remote');
    expect(prefilterJob(alex, job({ location: 'Remote', remote: true })).pass).toBe(true);
    expect(prefilterJob(alex, job({ location: 'USA', remote: true })).reason).toBe('Remote, but outside your region');
    expect(prefilterJob(alex, job({ location: 'Remote', remote: true, description: 'React. US only, must be based in the US.' })).pass).toBe(false);
  });
});

describe('prefilter role family', () => {
  it('keeps engineering targets away from PM/design titles', () => {
    const p = { ...alex, targetRoles: ['Frontend Engineer', 'Product Engineer'] };
    expect(prefilterJob(p, job({ title: 'Product Manager, Growth' })).reason).toBe('Not an engineering role');
    expect(prefilterJob(p, job({ title: 'Product Engineer' })).pass).toBe(true);
  });
  it('treats "Europe"/"EMEA" locations as remote-friendly', () => {
    expect(prefilterJob(alex, job({ location: 'Europe', remote: false })).pass).toBe(true);
  });
});

describe('country-restricted remote', () => {
  it('drops remote roles limited to other countries, keeps Europe-wide and own country', () => {
    expect(prefilterJob(alex, job({ location: 'Remote (Poland)', remote: true })).reason).toBe('Remote, but only from other countries');
    expect(prefilterJob(alex, job({ location: 'Remote - Germany', remote: true })).pass).toBe(false);
    expect(prefilterJob(alex, job({ location: 'Remote (Europe, USA)', remote: true })).pass).toBe(true);
    expect(prefilterJob(alex, job({ location: 'Remote (Austria, Germany)', remote: true })).pass).toBe(true);
    expect(prefilterJob(alex, job({ location: 'Spain Remote', remote: true })).pass).toBe(false);
    expect(prefilterJob(alex, job({ location: 'Remote', remote: true })).pass).toBe(true);
  });
  it('ranks local jobs above remote ones', () => {
    const local = prefilterJob(alex, job({}));
    const remote = prefilterJob(alex, job({ location: 'Remote', remote: true }));
    expect(local.relevance).toBeGreaterThan(remote.relevance);
  });
});

describe('generic engineering titles', () => {
  it('passes a generic SWE title when the text uses the stack, not off-track ones', () => {
    const text = 'You will build our dashboard in React and TypeScript with Next.js.';
    expect(prefilterJob(alex, job({ title: 'Software Engineer - Auth', location: 'Remote', remote: true, description: text })).pass).toBe(true);
    expect(prefilterJob(alex, job({ title: 'Software Engineer - Auth', location: 'Remote', remote: true, description: 'Go and Rust.' })).pass).toBe(false);
    const backend = prefilterJob(alex, job({ title: 'Senior Backend Engineer', description: text }));
    expect(backend.pass).toBe(true); // adjacent: kept, but ranked low
    expect(backend.preScore!).toBeLessThan(prefilterJob(alex, job({ description: text })).preScore! - 15);
  });
});

describe('remote location lists', () => {
  it('reads "Remote in the United States" and bare place lists as restrictions', () => {
    expect(prefilterJob(alex, job({ location: 'Remote in the United States', remote: true })).pass).toBe(false);
    expect(prefilterJob(alex, job({ location: 'USA, Canada, Mexico', remote: true })).pass).toBe(false);
    expect(prefilterJob(alex, job({ location: 'Northern America, LATAM, Europe, APAC', remote: true })).pass).toBe(true);
    expect(prefilterJob(alex, job({ location: 'Vienna, Austria', remote: true })).pass).toBe(true);
    expect(prefilterJob(alex, job({ title: 'Product Manager (ex-product engineer)', remote: true, location: 'Remote' })).pass).toBe(false);
  });
});
