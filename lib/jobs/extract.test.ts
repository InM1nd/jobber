import { describe, expect, it } from 'vitest';
import { jobFromJsonLd, jobFromHeuristics, looksBlocked, pageText } from './extract';
import { checkUrl } from './add-by-link';

const ld = (o: object) => `<html><head><script type="application/ld+json">${JSON.stringify(o)}</script></head><body></body></html>`;

describe('job extraction', () => {
  it('reads JSON-LD JobPosting incl. @graph', () => {
    const j = jobFromJsonLd(ld({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'JobPosting', title: 'Frontend Engineer', hiringOrganization: { name: 'ACME' }, jobLocation: { address: { addressLocality: 'Wien', addressCountry: 'AT' } }, description: '<p>' + 'Build UIs with React. '.repeat(10) + '</p>', datePosted: '2026-10-01' }] }));
    expect(j).toMatchObject({ title: 'Frontend Engineer', company: 'ACME', location: 'Wien, AT' });
    expect(j!.description).not.toContain('<p>');
  });
  it('reads iframe srcdoc ads (karriere.at)', () => {
    const inner = '<p>' + 'Wir suchen eine:n Entwickler:in. '.repeat(20) + '</p>';
    const html = `<iframe class="m-jobContent__iFrame" srcdoc="${inner.replace(/"/g, '&quot;').replace(/</g, '&lt;')}"></iframe>`;
    expect(pageText(html, ['iframe.m-jobContent__iFrame'])).toContain('Entwickler');
  });
  it('falls back to heuristics', () => {
    const j = jobFromHeuristics(`<html><body><nav>menu</nav><main><h1>Barista</h1><p>${'Make coffee daily. '.repeat(20)}</p></main></body></html>`);
    expect(j?.title).toBe('Barista');
    expect(j?.description).not.toContain('menu');
  });
  it('detects blocks and unsafe urls', () => {
    expect(looksBlocked(403, '')).toBe(true);
    expect(looksBlocked(200, '<title>Just a moment...</title>')).toBe(true);
    expect(looksBlocked(200, '<h1>Job</h1>')).toBe(false);
    expect(() => checkUrl('http://localhost:3000/x')).toThrow();
    expect(() => checkUrl('file:///etc/passwd')).toThrow();
    expect(checkUrl('https://www.willhaben.at/jobs/x').hostname).toBe('www.willhaben.at');
  });
});
