import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db/prisma';
import { APP_STATUSES, checkAgentAuth, companyRoleKey, getOwner, mapStatus, normalizeUrl, serialize, upsertAgentJob } from '@/lib/agent/api';

export const instant = false;
export const maxDuration = 60;

/** GET: list owner's tracker. Filters: status, url, company+role (dedup lookup), q, updatedSince, limit. */
export async function GET(request: Request) {
  const denied = checkAgentAuth(request);
  if (denied) return denied;
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner user not found' }, { status: 404 });
  const sp = new URL(request.url).searchParams;
  const where: Record<string, unknown> = { userId: owner.id };
  const status = sp.get('status');
  if (status) {
    const st = status.split(',').map((s) => mapStatus(s)).filter(Boolean) as string[];
    where.status = { in: st };
  }
  const url = sp.get('url');
  const company = sp.get('company');
  const role = sp.get('role');
  if (url || (company && role)) {
    const keys = [normalizeUrl(url), company && role ? companyRoleKey(company, role) : null].filter(Boolean) as string[];
    where.OR = [
      { dedupeKey: { in: keys } },
      ...(company && role ? [{ company: { equals: company, mode: 'insensitive' }, role: { equals: role, mode: 'insensitive' } }] : []),
    ];
  } else if (company) {
    where.company = { contains: company, mode: 'insensitive' };
  }
  const q = sp.get('q');
  if (q) where.AND = [{ OR: [{ company: { contains: q, mode: 'insensitive' } }, { role: { contains: q, mode: 'insensitive' } }] }];
  const since = sp.get('updatedSince');
  if (since && !isNaN(Date.parse(since))) where.updatedAt = { gte: new Date(since) };
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 500, 1), 1000);
  const rows = await getPrisma().application.findMany({ where, orderBy: { updatedAt: 'desc' }, take: limit });
  return NextResponse.json({ count: rows.length, statuses: APP_STATUSES, items: rows.map(serialize) });
}

/** POST: upsert one job ({...}) or many ({items:[...]}, max 200). Dedup by normalized url, then company+role. */
export async function POST(request: Request) {
  const denied = checkAgentAuth(request);
  if (denied) return denied;
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner user not found' }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  if (Array.isArray(body.items)) {
    const items = body.items.slice(0, 200) as Record<string, unknown>[];
    const results = [];
    for (const [i, item] of items.entries()) {
      const r = await upsertAgentJob(owner.id, item);
      results.push('error' in r ? { index: i, error: r.error } : { index: i, id: r.application!.id, created: r.created });
    }
    return NextResponse.json({
      created: results.filter((r) => 'created' in r && r.created).length,
      updated: results.filter((r) => 'created' in r && !r.created).length,
      errors: results.filter((r) => 'error' in r),
      results,
    });
  }
  const r = await upsertAgentJob(owner.id, body);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ created: r.created, application: serialize(r.application!) }, { status: r.created ? 201 : 200 });
}
