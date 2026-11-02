import { getPrisma } from '@/lib/db/prisma';
import { isGenericCareersUrl, normalizeUrl } from '@/lib/agent/api';

/**
 * Links tracker Applications to Jobs the user has matches for (sets Application.jobId), so Matches,
 * alerts and digests can hide jobs that are already in the tracker. Never deletes anything.
 * Same job = same normalized URL (generic careers pages also need company+role), or fuzzy company + role.
 */
const LEGAL = /\b(gmbh|ag|se|inc|ltd|llc|kg|og|co|corp|corporation|company|sa|sas|bv|nv|plc|ab|oy|as|sro|spa|srl|limited|holding|group|the|e\.?u|mbh)\b/g;
const strip = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
export function normCompany(s: string) {
  return strip(s).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(LEGAL, ' ').replace(/\s+/g, ' ').trim();
}
const ROLE_NOISE = new Set(['m', 'w', 'd', 'f', 'x', 'mwd', 'fmx', 'all', 'genders', 'gender', 'remote', 'hybrid', 'vienna', 'wien', 'austria', 'onsite', 'in', 'and', 'the', 'of', 'for', 'with', 'a', 'to', 'at', 'based', 'eu', 'uk', 'eea', 'emea', 'europe', 'germany', 'deutschland', 'worldwide', 'anywhere']);
const ROLE_ALIAS: Record<string, string> = { developer: 'engineer', dev: 'engineer', entwickler: 'engineer', fullstack: 'full stack', 'front end': 'frontend', 'back end': 'backend', sr: 'senior', jr: 'junior' };
export function roleTokens(s: string) {
  let t = strip(s).replace(/[()]/g, ' ').replace(/[^a-z0-9+#. ]+/g, ' ');
  t = t.replace(/front[ -]end|back[ -]end/g, (m) => (m.startsWith('front') ? 'frontend' : 'backend')).replace(/\bfull-?stack\b/g, 'full stack');
  return new Set(t.split(/\s+/).map((w) => ROLE_ALIAS[w] ?? w).flatMap((w) => w.split(' ')).filter((w) => w && !ROLE_NOISE.has(w)));
}
export function sameCompany(a: string, b: string) {
  const x = normCompany(a), y = normCompany(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return s.length >= 3 && (l.startsWith(s + ' ') || l.endsWith(' ' + s) || l.replace(/ /g, '') === s.replace(/ /g, ''));
}
export function sameRole(a: string, b: string) {
  const x = roleTokens(a), y = roleTokens(b);
  if (!x.size || !y.size) return false;
  // Different specialisations of the same title (Front-End vs Back-End leaning, intern vs full role) are different jobs.
  for (const k of ['frontend', 'backend', 'intern', 'internship', 'student', 'working', 'manager']) if (x.has(k) !== y.has(k) && (k !== 'frontend' && k !== 'backend' ? true : (x.has('frontend') || x.has('backend')) && (y.has('frontend') || y.has('backend')))) return false;
  const inter = [...x].filter((w) => y.has(w)).length;
  const jaccard = inter / (x.size + y.size - inter);
  const [s, l] = x.size <= y.size ? [x, y] : [y, x];
  const subset = s.size >= 2 && [...s].every((w) => l.has(w));
  return jaccard >= 0.6 || subset;
}

type AppLite = { id: string; company: string; role: string; url: string | null; jobId: string | null };
type JobLite = { id: string; url: string; title: string; company: string };
export function findJobFor(app: AppLite, jobs: JobLite[]): JobLite | undefined {
  const key = normalizeUrl(app.url);
  const generic = isGenericCareersUrl(key);
  const fuzzy = (j: JobLite) => sameCompany(app.company, j.company) && sameRole(app.role, j.title);
  if (key) {
    const byUrl = jobs.find((j) => normalizeUrl(j.url) === key && (!generic || fuzzy(j)));
    if (byUrl) return byUrl;
  }
  return jobs.find(fuzzy);
}

/** Link unlinked applications of a user to their matched jobs. Returns the links made. */
export async function linkApplications(userId: string, opts: { applicationIds?: string[] } = {}) {
  const prisma = getPrisma();
  const apps = await prisma.application.findMany({
    where: { userId, jobId: null, ...(opts.applicationIds ? { id: { in: opts.applicationIds } } : {}) },
    select: { id: true, company: true, role: true, url: true, jobId: true },
  });
  if (!apps.length) return [];
  const taken = new Set((await prisma.application.findMany({ where: { userId, jobId: { not: null } }, select: { jobId: true } })).map((a) => a.jobId!));
  const matches = await prisma.jobMatch.findMany({
    where: { userId },
    select: { job: { select: { id: true, url: true, title: true, company: true, source: { select: { company: true } } } } },
  });
  const jobs: JobLite[] = matches
    .map((m) => ({ id: m.job.id, url: m.job.url, title: m.job.title, company: m.job.company || m.job.source.company }))
    .filter((j) => !taken.has(j.id));
  const links: { applicationId: string; jobId: string; app: string; job: string }[] = [];
  for (const app of apps) {
    const job = findJobFor(app, jobs.filter((j) => !taken.has(j.id)));
    if (!job) continue;
    taken.add(job.id);
    await prisma.application.update({ where: { id: app.id }, data: { jobId: job.id } });
    links.push({ applicationId: app.id, jobId: job.id, app: `${app.company} — ${app.role}`, job: `${job.company} — ${job.title}` });
  }
  return links;
}

/** Statuses meaning the user already applied (or got further). Only these hide a match; to_apply / check_listing / skip still show. */
export const APPLIED_STATUSES = ['applied', 'interview', 'on_hold', 'offer', 'rejected'];

/** Prisma filter: matches whose job is not linked to an application the user already sent. */
export const notTracked = (userId: string) => ({ job: { applications: { none: { userId, status: { in: APPLIED_STATUSES } } } } });

/**
 * One application can only carry one jobId, but the same posting often arrives from several boards
 * (ATS + karriere.at + derStandard + aggregators). This drops every match that is the same job as an
 * application the user already applied to (APPLIED_STATUSES): same normalized URL, or same
 * company + role. One small indexed query for the user's tracker, then in-memory matching.
 */
export async function dropTracked<T extends { job: { url: string; title: string; company: string | null; source: { company: string } } }>(userId: string, rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const all = await getPrisma().application.findMany({ where: { userId }, select: { company: true, role: true, url: true, status: true } });
  const apps = all.filter((a) => APPLIED_STATUSES.includes(a.status));
  if (!apps.length) return rows;
  const keys = (list: typeof all) => new Set(list.map((a) => normalizeUrl(a.url)).filter((u): u is string => Boolean(u) && !isGenericCareersUrl(u)));
  const urls = keys(apps);
  // A job whose exact URL is a not-yet-applied tracker entry (to_apply etc.) stays visible, even if it looks like a sibling role.
  const open = keys(all.filter((a) => !APPLIED_STATUSES.includes(a.status)));
  return rows.filter((r) => {
    const company = r.job.company || r.job.source.company;
    const key = normalizeUrl(r.job.url) as string;
    if (urls.has(key)) return false;
    if (open.has(key)) return true;
    return !apps.some((a) => sameCompany(a.company, company) && sameRole(a.role, r.job.title));
  });
}
