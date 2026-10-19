import { describe, expect, it } from 'vitest';
import { parseJoinPage } from './join';

const page = (items: unknown[]) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { initialState: { jobs: { items, pagination: { pageCount: 2 } } } } } })}</script></html>`;

describe('parseJoinPage', () => {
  it('maps embedded JOIN jobs', () => {
    const { jobs, pageCount } = parseJoinPage(
      page([{ id: 1, idParam: '1-frontend-dev', title: 'Frontend Dev', workplaceType: 'HYBRID', city: { cityName: 'Vienna', countryName: 'Austria' }, createdAt: '2026-10-01T00:00:00Z', salaryFrequency: 'PER_MONTH', salaryAmountFrom: { amount: 400000, currency: 'EUR' }, settings: { showSalary: true } }]),
      'acme',
    );
    expect(pageCount).toBe(2);
    expect(jobs[0]).toMatchObject({ externalId: '1', title: 'Frontend Dev', location: 'Vienna, Austria · Hybrid', url: 'https://join.com/companies/acme/1-frontend-dev', salaryMin: 56000, currency: 'EUR', remote: false });
  });
  it('returns nothing without embedded data', () => {
    expect(parseJoinPage('<html></html>', 'x').jobs).toEqual([]);
  });
});
