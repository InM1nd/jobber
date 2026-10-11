import { getPrisma } from '@/lib/db/prisma';

/**
 * Polite HTTP for the owner-only scrapers: identifiable UA, a pause between
 * requests to the same host, a small in-memory cache and a per-platform
 * daily page budget (stored in CronJob rows so it holds across instances).
 */

export const SCRAPER_UA = process.env.SCRAPER_USER_AGENT || 'JobberBot/1.0 (+https://jobber-kohl.vercel.app; personal job search, low volume)';
const DELAY_MS = Number(process.env.SCRAPER_DELAY_MS || 2500);
export const MAX_PAGES_PER_DAY = Number(process.env.SCRAPER_MAX_PAGES_PER_DAY || 12);

const g = globalThis as unknown as { scrapeLast?: Map<string, number>; scrapeCache?: Map<string, { at: number; body: string }> };
g.scrapeLast ??= new Map();
g.scrapeCache ??= new Map();
const CACHE_MS = 6 * 3600 * 1000;

export class BudgetError extends Error {}

async function takePage(platform: string) {
  if (process.env.SCRAPER_BUDGET === 'off') return;
  const name = `scrape:${platform}:${new Date().toISOString().slice(0, 10)}`;
  const prisma = getPrisma();
  const row = await prisma.cronJob.findUnique({ where: { name } });
  const used = Number(row?.lastStatus || 0);
  if (used >= MAX_PAGES_PER_DAY) throw new BudgetError(`${platform}: daily page budget (${MAX_PAGES_PER_DAY}) used`);
  await prisma.cronJob.upsert({ where: { name }, create: { name, lastStatus: '1' }, update: { lastStatus: String(used + 1) } });
}

export async function politeGet(platform: string, url: string): Promise<string> {
  const hit = g.scrapeCache!.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;
  await takePage(platform);
  const host = new URL(url).host;
  const wait = (g.scrapeLast!.get(host) || 0) + DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  g.scrapeLast!.set(host, Date.now());
  const res = await fetch(url, {
    headers: { 'user-agent': SCRAPER_UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'de-AT,de;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(20_000),
    redirect: 'follow',
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${platform}: HTTP ${res.status}`);
  if (/cf-chl|captcha|just a moment\.\.\./i.test(body.slice(0, 20000))) throw new Error(`${platform}: blocked by a bot check — stopping`);
  g.scrapeCache!.set(url, { at: Date.now(), body });
  return body;
}

/** Drop personal data from descriptions: e-mails, phone numbers, contact-person lines. */
export function scrubPersonal(text: string) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email removed]')
    .replace(/(\+|00)\s?\d[\d\s/().-]{7,}\d/g, '[phone removed]')
    .split('\n')
    .filter((l) => !/(ansprechperson|ansprechpartner|kontaktperson|contact person|your contact|ihr kontakt|recruiter:|hr business partner:)/i.test(l))
    .join('\n');
}

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
