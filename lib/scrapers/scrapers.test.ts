import { describe, expect, it, afterEach } from 'vitest';
import { PLATFORMS, scrapersEnabledFor } from './index';
import { scrubPersonal } from './polite';
import { makeDedupeKey } from '@/lib/jobs/dedupe';

describe('owner scrapers', () => {
  afterEach(() => { delete process.env.OWNER_SCRAPERS; delete process.env.OWNER_TELEGRAM_ID; delete process.env.SCRAPER_TELEGRAM_IDS; });
  it('only enables for the owner with the flag on', () => {
    process.env.OWNER_TELEGRAM_ID = '42';
    expect(scrapersEnabledFor({ telegramId: '42' })).toBe(false);
    process.env.OWNER_SCRAPERS = 'true';
    expect(scrapersEnabledFor({ telegramId: '42' })).toBe(true);
    expect(scrapersEnabledFor({ telegramId: '7' })).toBe(false);
    expect(scrapersEnabledFor(null)).toBe(false);
    process.env.SCRAPER_TELEGRAM_IDS = ' 7, 8 ,';
    expect(scrapersEnabledFor({ telegramId: '7' })).toBe(true);
    expect(scrapersEnabledFor({ telegramId: '9' })).toBe(false);
  });
  it('scrubs personal data', () => {
    const t = scrubPersonal('Apply now\nIhre Ansprechperson: Maria Muster\nmail jobs.x@firma.at or +43 1 234 56 78');
    expect(t).not.toMatch(/Maria|@firma|234 56/);
  });
  it('parses a karriere list item', () => {
    const p = PLATFORMS.find((x) => x.id === 'karriere')!;
    const html = `<div class="m-jobsListItem"><h2 class="m-jobsListItem__title"><a class="m-jobsListItem__titleLink" href="https://www.karriere.at/jobs/123">Frontend Dev</a></h2><a class="m-jobsListItem__companyName">ACME</a><li class="m-jobsListItem__location">Wien,</li><span class="m-jobsListItem__date">Gestern veröffentlicht</span></div>`;
    const [j] = p.parseList!(html, '');
    expect(j).toMatchObject({ externalId: 'karriere:123', company: 'ACME', title: 'Frontend Dev', location: 'Wien' });
  });
  it('dedupes gendered titles across platforms', () => {
    expect(makeDedupeKey('ACME GmbH', 'Frontend Entwickler*in (m/w/d)', 'Wien, Linz')).toBe(makeDedupeKey('ACME', 'Frontend Entwickler', 'Wien'));
  });
  it('documents blocked/robots platforms', () => {
    expect(PLATFORMS.filter((p) => p.status !== 'enabled').map((p) => p.id).sort()).toEqual(['ams', 'indeed', 'willhaben']);
  });
});
