import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db/prisma';
import { getApplications, getMatches, getProfile, countSkipped } from '@/lib/data/service';
import { getOwner } from '@/lib/agent/api';
import { latestRun } from '@/lib/search/pipeline';

export const maxDuration = 30;

/** Read-only timing probe for the owner's main views (CRON_SECRET). Returns only numbers. */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'no owner' }, { status: 404 });
  const t = async <T,>(fn: () => Promise<T>) => { const s = performance.now(); const v = await fn(); return { ms: Math.round(performance.now() - s), bytes: JSON.stringify(v ?? null).length, n: Array.isArray(v) ? v.length : undefined }; };
  const out: Record<string, unknown> = { region: process.env.VERCEL_REGION };
  out.ping = await t(() => getPrisma().$queryRaw`select 1`);
  out.ping2 = await t(() => getPrisma().$queryRaw`select 1`);
  out.matchesPage = await t(() => Promise.all([getMatches(owner.id), getProfile(owner.id), latestRun(owner.id), countSkipped(owner.id)]));
  out.getMatches = await t(() => getMatches(owner.id));
  out.getApplications = await t(() => getApplications(owner.id));
  return NextResponse.json(out);
}
