import { describe, expect, it } from 'vitest';
import { combine, languageScore, locationScore, parseAiScores, salaryScore, seniorityScore, yearsRequired } from './rubric';
import { prefilterJob, locationTier, titleLevel, type PrefilterProfile } from '@/lib/jobs/prefilter';
import { budgetLeft, pacificDay } from '@/lib/ai/budget';
import { detectAtsFromUrl } from '@/lib/companies/detect';
import { draftFromCvs, draftFromProfile, parseLanguage, profilePatchFromDraft } from '@/lib/profile/draft';
import { CvProfileSchema } from '@/lib/ai/cv-profile';

const base: PrefilterProfile = {
  targetRoles: ['Frontend Engineer'], keywords: ['frontend'], skills: ['React', 'TypeScript'], location: 'Vienna, Austria',
  city: 'Vienna', country: 'Austria', openTo: ['city', 'country', 'remote'], remoteOnly: false, languages: ['English (Fluent)'], seniority: 'mid',
};
const job = (over: Partial<{ title: string; location: string; remote: boolean; description: string; company: string; postedAt: Date }>) => ({
  title: 'Frontend Engineer', location: 'Vienna, Austria', remote: false, description: 'React and TypeScript.', ...over,
});

describe('location tiers', () => {
  it('city → country → remote → relocation', () => {
    expect(locationTier(base, job({ location: 'Wien' })).tier).toBe('city');
    expect(locationTier(base, job({ location: 'Graz' })).tier).toBe('country');
    expect(locationTier(base, job({ location: 'Remote (Europe)', remote: true })).tier).toBe('remote');
    expect(locationTier(base, job({ location: 'Berlin, Germany' })).tier).toBe('relocation');
    expect(locationTier(base, job({ location: 'Remote (United States)', remote: true })).tier).toBe('other');
  });
  it('respects what the user is open to', () => {
    expect(prefilterJob(base, job({ location: 'Berlin, Germany' })).pass).toBe(false);
    expect(prefilterJob({ ...base, openTo: ['city', 'relocation'] }, job({ location: 'Berlin, Germany' })).pass).toBe(true);
    expect(prefilterJob({ ...base, openTo: ['city'] }, job({ location: 'Remote', remote: true })).pass).toBe(false);
    expect(prefilterJob({ ...base, openTo: ['city'] }, job({ location: 'Graz, Austria' })).reason).toBe('Not in your city');
  });
  it('ranks local jobs above remote ones', () => {
    const local = prefilterJob(base, job({}));
    const remote = prefilterJob(base, job({ location: 'Remote', remote: true }));
    expect(local.relevance).toBeGreaterThan(remote.relevance);
  });
});

describe('controls', () => {
  it('stretch allows exactly one level up', () => {
    expect(titleLevel('Senior Frontend Engineer')).toBe(3);
    expect(prefilterJob(base, job({ title: 'Senior Frontend Engineer' })).reason).toBe('Too senior');
    expect(prefilterJob({ ...base, stretch: true }, job({ title: 'Senior Frontend Engineer' })).pass).toBe(true);
    expect(prefilterJob({ ...base, stretch: true }, job({ title: 'Staff Frontend Engineer' })).pass).toBe(false);
  });
  it('applies exclusions, avoid words, age and employment type', () => {
    expect(prefilterJob({ ...base, excludeCompanies: ['Acme'] }, job({ company: 'Acme GmbH' })).reason).toMatch(/excluded/);
    expect(prefilterJob({ ...base, avoidKeywords: ['crypto'] }, job({ description: 'A crypto exchange using React.' })).reason).toMatch(/avoid/);
    expect(prefilterJob({ ...base, maxJobAgeDays: 30 }, job({ postedAt: new Date(Date.now() - 40 * 86_400_000) })).reason).toMatch(/Older/);
    expect(prefilterJob({ ...base, employmentTypes: ['full_time'] }, job({ title: 'Frontend Engineer (Teilzeit)' })).reason).toBe('Part-time');
  });
  it('works for non-tech professions', () => {
    const nurse: PrefilterProfile = { ...base, targetRoles: ['Pflegefachkraft', 'Nurse'], keywords: ['pflege'], skills: ['Intensivpflege'], languages: ['German (Native)'] };
    expect(prefilterJob(nurse, job({ title: 'Pflegefachkraft (m/w/d) Intensivstation', description: 'Wir suchen Pflege...' })).pass).toBe(true);
    expect(prefilterJob(nurse, job({ title: 'Frontend Engineer' })).pass).toBe(false);
  });
});

describe('rubric', () => {
  it('spreads scores across the range', () => {
    const strong = combine({ role: 95, skills: 90, seniority: 100, location: 100, language: 100, salary: 70 });
    const adjacent = combine({ role: 65, skills: 55, seniority: 82, location: 78, language: 100, salary: 70 });
    const off = combine({ role: 20, skills: 15, seniority: 82, location: 100, language: 100, salary: 100 });
    expect(strong).toBeGreaterThanOrEqual(90);
    expect(adjacent).toBeGreaterThan(55);
    expect(adjacent).toBeLessThan(75);
    expect(off).toBeLessThanOrEqual(32);
  });
  it('deterministic parts', () => {
    expect(locationScore('city')).toBeGreaterThan(locationScore('remote'));
    expect(languageScore(['English (Fluent)'], 'German is a plus')).toBe(75);
    expect(yearsRequired('You have 5+ years of experience')).toBe(5);
    expect(seniorityScore({ seniority: 'mid', yearsExperience: 2 }, 'Frontend Engineer', '6+ years')).toBeLessThan(60);
    expect(seniorityScore({ seniority: 'mid', stretch: true }, 'Senior Frontend Engineer', '')).toBe(72);
    expect(salaryScore({ salaryMin: 60000 }, { salaryMax: 45000 })).toBe(20);
  });
  it('parses batched AI output defensively', () => {
    const r = parseAiScores({ results: [{ id: 'j1', roleFit: '88', skills: 70, cv: 'b', reasons: ['x'] }, { id: 'j2', roleFit: 'n/a' }] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'j1', roleFit: 88, cv: 'B' });
  });
});

describe('shared budget', () => {
  it('keeps a reserve for onboarding', () => {
    delete process.env.GEMINI_RPD_LITE;
    expect(budgetLeft(0, 'gemini-3.5-flash-lite', true)).toBe(480);
    expect(budgetLeft(0, 'gemini-3.5-flash-lite', false)).toBe(400);
    expect(budgetLeft(410, 'gemini-3.5-flash-lite', false)).toBe(0);
    expect(budgetLeft(410, 'gemini-3.5-flash-lite', true)).toBe(70);
    expect(budgetLeft(0, 'gemini-3.5-flash', false)).toBe(18);
    expect(pacificDay(new Date('2026-10-11T06:00:00Z'))).toBe('2026-10-10');
  });
});

describe('ATS detection from careers URLs', () => {
  it('recognises common boards', () => {
    expect(detectAtsFromUrl('https://job-boards.greenhouse.io/gitlab/jobs/1')).toEqual({ ats: 'greenhouse', slug: 'gitlab' });
    expect(detectAtsFromUrl('https://jobs.lever.co/agicap')).toEqual({ ats: 'lever', slug: 'agicap' });
    expect(detectAtsFromUrl('https://acme.jobs.personio.de/')).toEqual({ ats: 'personio', slug: 'acme' });
    expect(detectAtsFromUrl('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite')).toEqual({ ats: 'workday', slug: 'nvidia:wd5:NVIDIAExternalCareerSite' });
    expect(detectAtsFromUrl('https://storytel.teamtailor.com/jobs')).toEqual({ ats: 'teamtailor', slug: 'storytel' });
    expect(detectAtsFromUrl('https://example.com/careers')).toBeNull();
  });
});

describe('guided form draft', () => {
  const cv = (over: object) => CvProfileSchema.parse({ targetRoles: ['Frontend Engineer'], skills: ['React'], languages: ['English (C1)', 'German (A2)'], location: 'Vienna, Austria', seniority: 'mid', remotePreference: 'hybrid', ...over });
  it('merges several CVs and maps language levels to plain words', () => {
    const d = draftFromCvs([cv({}), cv({ targetRoles: ['Product Engineer'], skills: ['Node.js'], yearsExperience: 6 })]);
    expect(d.targetRoles).toEqual(['Frontend Engineer', 'Product Engineer']);
    expect(d.skills).toEqual(['React', 'Node.js']);
    expect(d.city).toBe('Vienna');
    expect(d.languages).toEqual([{ name: 'English', level: 'Fluent' }, { name: 'German', level: 'Basic' }]);
    expect(d.openTo).toContain('remote');
    expect(parseLanguage('Russian (native)').level).toBe('Native');
  });
  it('round-trips through the profile columns', () => {
    const d = draftFromCvs([cv({})]);
    const patch = profilePatchFromDraft({ ...d, openTo: ['remote'] });
    expect(patch.remoteOnly).toBe(true);
    expect(patch.location).toBe('Vienna, Austria');
    const back = draftFromProfile({ ...patch, skillGaps: [], salaryMin: null, salaryMax: null } as never);
    expect(back.languages[0]).toEqual({ name: 'English', level: 'Fluent' });
    expect(back.openTo).toEqual(['remote']);
  });
});
