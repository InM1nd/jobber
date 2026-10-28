import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isPrivateIp, safeFetchText, UnsafeUrlError } from './safe-fetch';

const resolveTo = (map: Record<string, string[]>) => async (host: string) => map[host] || [];

describe('SSRF guard', () => {
  it('knows private and reserved addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'not-an-ip']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '104.16.1.1', '2606:4700::1111']) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it('refuses names that resolve to the private network, odd ports and logins', async () => {
    const resolve = resolveTo({ 'jobs.example.com': ['93.184.216.34'], 'evil.example.com': ['93.184.216.34', '10.0.0.5'] });
    await expect(assertPublicUrl(new URL('https://jobs.example.com/x'), resolve)).resolves.toBeUndefined();
    await expect(assertPublicUrl(new URL('https://evil.example.com/'), resolve)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl(new URL('http://169.254.169.254/latest'), resolve)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl(new URL('https://jobs.example.com:6379/'), resolve)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl(new URL('https://u:p@jobs.example.com/'), resolve)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl(new URL('ftp://jobs.example.com/'), resolve)).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('checks every redirect hop and caps the body', async () => {
    const resolve = resolveTo({ 'a.example.com': ['93.184.216.34'], 'b.example.com': ['93.184.216.35'] });
    const pages: Record<string, Response> = {};
    const fetchImpl = (async (u: URL) => {
      const key = String(u);
      if (key === 'https://a.example.com/jobs/1') return new Response(null, { status: 302, headers: { location: 'https://b.example.com/j1' } });
      if (key === 'https://b.example.com/j1') return new Response('x'.repeat(5000), { status: 200 });
      if (key === 'https://a.example.com/meta') return new Response(null, { status: 301, headers: { location: 'http://169.254.169.254/' } });
      return pages[key] || new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;
    const ok = await safeFetchText('https://a.example.com/jobs/1', { resolve, fetchImpl, maxBytes: 1000 });
    expect(ok).toMatchObject({ url: 'https://b.example.com/j1', status: 200 });
    expect(ok.text.length).toBe(1000);
    await expect(safeFetchText('https://a.example.com/meta', { resolve, fetchImpl })).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});
