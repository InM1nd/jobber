import { describe, expect, it } from 'vitest';
import { jsearchSourceUrl, parseJSearch, usedThisMonth, viaOf } from './jsearch';

const reply = {
  status: 'OK',
  data: [
    {
      job_id: 'abc==', job_title: 'Frontend Engineer (m/w/d)', employer_name: 'Bitpanda', job_publisher: 'LinkedIn',
      job_apply_link: 'https://www.linkedin.com/jobs/view/123', apply_options: [
        { publisher: 'LinkedIn', apply_link: 'https://www.linkedin.com/jobs/view/123', is_direct: false },
        { publisher: 'Bitpanda', apply_link: 'https://careers.bitpanda.com/jobs/42', is_direct: true },
      ],
      job_description: 'React and TypeScript.', job_is_remote: false, job_city: 'Wien', job_country: 'AT', job_location: 'Wien, Österreich',
      job_posted_at_datetime_utc: '2026-10-25T08:00:00.000Z', job_min_salary: 60000, job_max_salary: 75000, job_salary_currency: 'EUR', job_salary_period: 'YEAR',
    },
    { job_id: 'hourly', job_title: 'Contract dev', job_apply_link: 'https://indeed.com/x', job_min_salary: 40, job_salary_period: 'HOUR', job_publisher: 'Indeed' },
    { job_id: 'nolink', job_title: 'No link' },
    { nonsense: true },
  ],
};

describe('JSearch', () => {
  it('reads jobs, prefers the employer’s own apply link, keeps yearly salaries only', () => {
    const jobs = parseJSearch(reply);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      externalId: 'jsearch:abc==', company: 'Bitpanda', title: 'Frontend Engineer (m/w/d)', location: 'Wien, Österreich',
      url: 'https://careers.bitpanda.com/jobs/42', salaryMin: 60000, salaryMax: 75000, remote: false,
    });
    expect(viaOf(jobs[0].description)).toBe('LinkedIn');
    expect(jobs[1].salaryMin).toBeUndefined();
    expect(viaOf(jobs[1].description)).toBe('Indeed');
  });

  it('builds one source URL per user and keyword', () => {
    const url = jsearchSourceUrl('u1', 'React Developer', { city: 'Vienna', country: 'Austria', remote: true });
    const [base, frag] = url.split('#');
    const q = new URL(base).searchParams;
    expect(q.get('query')).toBe('react developer in Vienna, Austria');
    expect(q.get('country')).toBe('at');
    expect(q.get('date_posted')).toBe('week');
    expect(frag).toBe('user=u1');
  });

  it('counts requests per calendar month', () => {
    const now = new Date('2026-10-28T10:00:00Z');
    expect(usedThisMonth('2026-10:37', now)).toBe(37);
    expect(usedThisMonth('2026-09:180', now)).toBe(0);
    expect(usedThisMonth(null, now)).toBe(0);
  });
});
