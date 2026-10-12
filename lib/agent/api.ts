import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db/prisma';

/** Private API for the owner's assistant agent. Bearer AGENT_API_KEY; writes to OWNER_TELEGRAM_ID's tracker. */
export function checkAgentAuth(request: Request): NextResponse | null {
  const key = process.env.AGENT_API_KEY;
  if (!key || key.length < 24) return NextResponse.json({ error: 'Agent API disabled' }, { status: 503 });
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = createHash('sha256').update(token).digest();
  const b = createHash('sha256').update(key).digest();
  if (!token || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

export async function getOwner() {
  const tg = process.env.OWNER_TELEGRAM_ID || '336128859';
  return getPrisma().user.findUnique({ where: { telegramId: tg }, select: { id: true } });
}

/** Agent/sheet status labels → app status. */
const STATUS_MAP: Record<string, string> = {
  'to apply': 'to_apply', to_apply: 'to_apply', todo: 'to_apply', new: 'to_apply',
  'check listing': 'check_listing', check_listing: 'check_listing', check: 'check_listing',
  applied: 'applied', submitted: 'applied',
  'on hold': 'on_hold', on_hold: 'on_hold', hold: 'on_hold', waiting: 'on_hold',
  rejected: 'rejected', declined: 'rejected', closed: 'rejected',
  skip: 'skip', skipped: 'skip', 'not a fit': 'skip',
  interview: 'interview', interviewing: 'interview', offer: 'offer',
};
export const APP_STATUSES = ['to_apply', 'check_listing', 'applied', 'interview', 'on_hold', 'offer', 'rejected', 'skip'];

export function mapStatus(v: unknown): string | null {
  if (v == null || v === '') return null;
  const k = String(v).trim().toLowerCase().replace(/\s+/g, ' ');
  return STATUS_MAP[k] ?? null;
}

export function mapPriority(v: unknown): string | null {
  if (v == null || v === '') return null;
  const k = String(v).trim().toLowerCase();
  if (k.startsWith('h')) return 'high';
  if (k.startsWith('m')) return 'medium';
  if (k.startsWith('l')) return 'low';
  return null;
}

const TRACKING = /^(utm_|gclid|fbclid|ref|refid|trk|src|source|mc_)/i;
export function normalizeUrl(raw: unknown): string | null {
  if (!raw) return null;
  try {
    const u = new URL(String(raw).trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const q = u.searchParams.toString();
    return `url:${host}${path}${q ? '?' + q : ''}`;
  } catch {
    return null;
  }
}
export function isGenericCareersUrl(key: string | null) {
  if (!key) return false;
  const path = key.replace(/^url:[^/?]+/, '').split('?')[0].toLowerCase();
  return path === '' || /\/(careers?|jobs?|karriere|stellen(angebote)?|join(-us)?|work-with-us|open-positions)$/.test(path);
}
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function companyRoleKey(company: string, role: string) {
  return `cr:${norm(company)}|${norm(role)}`;
}

export function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  const d = dmy ? new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1])) : new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

const str = (v: unknown, max: number) => (v == null || v === '' ? undefined : String(v).trim().slice(0, max));

export type AgentJobInput = Record<string, unknown>;

/** Find existing by normalized url, then by company+role. Returns {application, created} or an error. */
export async function upsertAgentJob(userId: string, input: AgentJobInput) {
  const prisma = getPrisma();
  const company = str(input.company, 160);
  const role = str(input.role, 160);
  if (!company || !role) return { error: 'company and role are required' };

  const statusRaw = input.status;
  const status = statusRaw === undefined || statusRaw === '' ? undefined : mapStatus(statusRaw);
  if (status === null) return { error: `unknown status "${String(statusRaw)}"` };
  const priority = input.priority === undefined ? undefined : mapPriority(input.priority);
  const scoreNum = input.score === undefined || input.score === '' || input.score === null ? undefined : Number(input.score);
  const score = scoreNum === undefined || !isFinite(scoreNum) ? undefined : Math.max(0, Math.min(100, Math.round(scoreNum)));
  const appliedAt = parseDate(input.appliedAt);
  const followUpAt = parseDate(input.followUpAt);

  const url = str(input.url, 500);
  const urlKey = normalizeUrl(url);
  const crKey = companyRoleKey(company, role);
  const dedupeKey = urlKey && !isGenericCareersUrl(urlKey) ? urlKey : crKey;

  // A generic careers page (…/careers, /jobs) can host several roles: only dedupe on it when company+role also match.
  const byUrl = urlKey ? await prisma.application.findMany({ where: { userId, dedupeKey: urlKey }, take: 20 }) : [];
  const urlHit = byUrl.find((a) => companyRoleKey(a.company, a.role) === crKey) ?? (isGenericCareersUrl(urlKey) ? undefined : byUrl[0]);
  const existing =
    urlHit ||
    (await prisma.application.findFirst({ where: { userId, dedupeKey: crKey } })) ||
    (await prisma.application.findFirst({
      where: { userId, company: { equals: company, mode: 'insensitive' }, role: { equals: role, mode: 'insensitive' } },
    }));

  const data = {
    company,
    role,
    url,
    location: str(input.location, 200),
    source: str(input.source, 80),
    priority: priority ?? undefined,
    score,
    whyFit: str(input.whyFit, 4000),
    risks: str(input.risks, 4000),
    nextAction: str(input.nextAction, 4000),
    notes: str(input.notes, 8000),
    status,
    appliedAt,
    followUpAt,
  };

  if (existing) {
    const application = await prisma.application.update({
      where: { id: existing.id },
      data: { ...data, dedupeKey: existing.dedupeKey?.startsWith('url:') ? existing.dedupeKey : dedupeKey, ...(followUpAt !== undefined ? { followUpSent: false } : {}) },
    });
    return { application, created: false };
  }
  const application = await prisma.application.create({
    data: { ...data, userId, status: status ?? 'to_apply', dedupeKey },
  });
  return { application, created: true };
}

export function serialize(a: {
  id: string; company: string; role: string; url: string | null; location: string | null; source: string | null;
  priority: string | null; score: number | null; whyFit: string | null; risks: string | null; nextAction: string | null;
  status: string; appliedAt: Date | null; followUpAt: Date | null; notes: string | null; dedupeKey: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: a.id, company: a.company, role: a.role, url: a.url, location: a.location, source: a.source,
    priority: a.priority, score: a.score, whyFit: a.whyFit, risks: a.risks, nextAction: a.nextAction,
    status: a.status, appliedAt: a.appliedAt, followUpAt: a.followUpAt, notes: a.notes, dedupeKey: a.dedupeKey,
    createdAt: a.createdAt, updatedAt: a.updatedAt,
  };
}
