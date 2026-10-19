import { describe, expect, it } from 'vitest';
import { parseKarriereJson } from './platforms';

const body = (items: unknown[], more = true) =>
  JSON.stringify({ data: { jobsSearchList: { jobsListHeader: { count: '31' }, loadMoreJobsButton: { active: more }, activeItems: { items } } } });
const item = (id: string, home: boolean) => ({
  jobsItem: { id, title: 'Frontend Developer (React)', link: `https://www.karriere.at/jobs/${id}`, company: { name: 'ACME', isChiffre: false }, locations: [{ name: 'Wien' }], isHomeOffice: home, summary: 'React + TS', salary: 'ab 4.000 € monatlich', date: 'vor 2 Tagen veröffentlicht' },
});

describe('parseKarriereJson', () => {
  it('maps search JSON items', () => {
    const r = parseKarriereJson(body([item('1', true)]));
    expect(r.total).toBe(31);
    expect(r.hasNext).toBe(true);
    expect(r.jobs[0]).toMatchObject({ externalId: 'karriere:1', company: 'ACME', location: 'Wien', remote: true, salaryMin: 56000, url: 'https://www.karriere.at/jobs/1' });
  });
  it('keeps only home-office jobs for Austria-wide searches', () => {
    expect(parseKarriereJson(body([item('1', true), item('2', false)]), { remoteOnly: true }).jobs.map((j) => j.externalId)).toEqual(['karriere:1']);
  });
});
