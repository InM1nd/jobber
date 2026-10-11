import { describe, expect, it } from 'vitest';
import { parseCvProfile } from './cv-profile';
import { applyPlan } from './search-plan';
import { SEED_COMPANIES, boardUrl, rankCompanies } from '@/lib/companies/seed';

describe('parseCvProfile', () => {
  it('accepts a clean model reply', () => {
    const p = parseCvProfile(JSON.stringify({
      fullName: 'Alex Z', targetRoles: ['Frontend Engineer', 'React Developer'], seniority: 'Senior',
      yearsExperience: 6, skills: ['React', 'TypeScript', 'React'], languages: ['English (C1)'],
      location: 'Vienna, Austria', remotePreference: 'hybrid', salaryMin: 60000, salaryMax: 75000,
      gaps: ['No German'], summary: 'Frontend engineer.',
    }));
    expect(p.seniority).toBe('senior');
    expect(p.skills).toEqual(['React', 'TypeScript']);
    expect(p.remotePreference).toBe('hybrid');
    expect(p.salaryMax).toBe(75000);
  });

  it('tolerates fenced JSON, junk types and placeholder strings', () => {
    const p = parseCvProfile('```json\n{"fullName":"null","targetRoles":"Engineer","seniority":"wizard","yearsExperience":"7 years","skills":[1,"Go",null],"remotePreference":"maybe","salaryMin":"€55,000","salaryMax":40000}\n```');
    expect(p.fullName).toBeNull();
    expect(p.targetRoles).toEqual([]);
    expect(p.seniority).toBe('mid');
    expect(p.yearsExperience).toBe(7);
    expect(p.skills).toEqual(['Go']);
    expect(p.remotePreference).toBe('any');
    expect(p.salaryMin).toBe(55000);
    expect(p.salaryMax).toBeNull(); // below min → dropped
    expect(p.languages).toEqual([]);
  });

  it('rejects absurd numbers', () => {
    const p = parseCvProfile({ yearsExperience: 99, salaryMin: 12 });
    expect(p.yearsExperience).toBeNull();
    expect(p.salaryMin).toBeNull();
  });

  it('throws when there is no JSON at all', () => {
    expect(() => parseCvProfile('sorry, I cannot')).toThrow();
  });
});

describe('search plan', () => {
  const profile = parseCvProfile({ targetRoles: ['Frontend Engineer'], skills: ['React', 'TypeScript'], location: 'Vienna, Austria' });

  it('only keeps companies from the verified shortlist', () => {
    const shortlist = rankCompanies({ skills: profile.skills, location: profile.location }, 20);
    const picked = shortlist.slice(0, 4).map((c) => c.name);
    const plan = applyPlan({ companies: [...picked, 'Totally Made Up GmbH'], titles: ['Frontend Engineer'], keywords: ['react'] }, shortlist, profile);
    expect(plan.companies.map((c) => c.name)).toEqual(picked);
    expect(plan.aiPicked).toBe(true);
  });

  it('falls back to ranking when the model returns nothing usable', () => {
    const shortlist = rankCompanies({ skills: profile.skills, location: profile.location }, 20);
    const plan = applyPlan({ companies: ['Nope'] }, shortlist, profile);
    expect(plan.aiPicked).toBe(false);
    expect(plan.companies.length).toBeGreaterThan(3);
    expect(plan.keywords).toContain('frontend engineer');
  });

  it('seed list has board URLs for every company and ranks Vienna companies up', () => {
    expect(SEED_COMPANIES.length).toBeGreaterThan(30);
    for (const c of SEED_COMPANIES) expect(boardUrl(c)).toMatch(/^https:\/\//);
    const top = rankCompanies({ skills: ['React'], location: 'Vienna, Austria' }, 5).map((c) => c.hq);
    expect(top.some((hq) => /vienna/i.test(hq))).toBe(true);
  });
});
