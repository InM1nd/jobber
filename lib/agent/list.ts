import { getPrisma } from '@/lib/db/prisma';
import { companyRoleKey, mapStatus, normalizeUrl } from '@/lib/agent/api';

/** Shared list query for the agent API and the remote MCP endpoint. */
export async function listOwnerApplications(ownerId: string, sp: URLSearchParams) {
  const owner = { id: ownerId };
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
  return rows;
}
