import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Fetching a page whose address a user typed (a job link, a careers page) without letting
 * it reach the server's own network (SSRF): http(s) on standard ports only, every address
 * the name resolves to must be public, redirects are followed by hand and each hop is
 * checked again, and the body is cut off at a size limit. Idea from AienTech/dossier
 * (posting-fetch, guarded-fetch), written for Jobber.
 */

export class UnsafeUrlError extends Error {}

const parts4 = (ip: string) => ip.split('.').map(Number);

/** Whether an IP address is private, local, reserved or otherwise not on the public internet. */
export function isPrivateIp(raw: string): boolean {
  let ip = raw.replace(/^\[|\]$/g, '').toLowerCase();
  // IPv4-mapped IPv6: ::ffff:127.0.0.1 or ::ffff:7f00:1
  const mapped = ip.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) || ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    ip = mapped.length === 2 ? mapped[1] : [parseInt(mapped[1], 16) >> 8, parseInt(mapped[1], 16) & 255, parseInt(mapped[2], 16) >> 8, parseInt(mapped[2], 16) & 255].join('.');
  }
  if (isIP(ip) === 4) {
    const [a, b] = parts4(ip);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 || // this-net, private, loopback, multicast/reserved
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) || // IETF protocol assignments
      (a === 198 && (b === 18 || b === 19)) // benchmarking
    );
  }
  if (isIP(ip) === 6) {
    return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip) || ip.startsWith('64:ff9b:') || ip.startsWith('2001:db8');
  }
  return true; // not an IP at all: refuse
}

/** Throws unless the URL is http(s) on a standard port and its host resolves only to public addresses. */
export async function assertPublicUrl(url: URL, resolve: (host: string) => Promise<string[]> = defaultResolve): Promise<void> {
  if (!/^https?:$/.test(url.protocol)) throw new UnsafeUrlError('Only http and https links can be opened.');
  if (url.username || url.password) throw new UnsafeUrlError('Links with a login in them can’t be opened.');
  if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) throw new UnsafeUrlError('This link cannot be opened.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/(^|\.)(localhost|internal|local|lan|home|corp)$/i.test(host)) throw new UnsafeUrlError('This link cannot be opened.');
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (!addresses.length) throw new UnsafeUrlError('The site did not respond.');
  if (addresses.some(isPrivateIp)) throw new UnsafeUrlError('This link cannot be opened.');
}

async function defaultResolve(host: string) {
  return (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  resolve?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

/** GET with every hop checked. Returns the final URL, status and the body as text (cut at maxBytes). */
export async function safeFetchText(input: URL | string, opts: SafeFetchOptions = {}): Promise<{ url: string; status: number; ok: boolean; text: string }> {
  const { headers, timeoutMs = 15_000, maxBytes = 3_000_000, maxRedirects = 4, resolve, fetchImpl = fetch } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  let url = new URL(String(input));
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(url, resolve);
    const res = await fetchImpl(url, { headers, redirect: 'manual', signal });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (hop >= maxRedirects) throw new UnsafeUrlError('Too many redirects.');
      url = new URL(res.headers.get('location')!, url);
      await res.body?.cancel().catch(() => {});
      continue;
    }
    return { url: url.toString(), status: res.status, ok: res.ok, text: await readCapped(res, maxBytes) };
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(size, maxBytes));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, all.length - off);
    all.set(c.subarray(0, take), off);
    off += take;
    if (off >= all.length) break;
  }
  return new TextDecoder().decode(all);
}
