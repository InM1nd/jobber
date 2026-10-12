import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db/prisma';
import { checkAgentAuth, getOwner, mapStatus, parseDate, serialize } from '@/lib/agent/api';

export const instant = false;

/** PATCH: update status (+ optional appliedAt, followUpAt, notes, appendNote, nextAction). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkAgentAuth(request);
  if (denied) return denied;
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner user not found' }, { status: 404 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const prisma = getPrisma();
  const existing = await prisma.application.findFirst({ where: { id, userId: owner.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const st = mapStatus(body.status);
    if (!st) return NextResponse.json({ error: `unknown status "${String(body.status)}"` }, { status: 400 });
    data.status = st;
    if (st === 'applied' && !existing.appliedAt && body.appliedAt === undefined) data.appliedAt = new Date();
  }
  for (const k of ['appliedAt', 'followUpAt'] as const) {
    const d = parseDate(body[k]);
    if (d !== undefined) data[k] = d;
  }
  if (data.followUpAt !== undefined) data.followUpSent = false;
  if (typeof body.notes === 'string') data.notes = body.notes.slice(0, 8000);
  if (typeof body.appendNote === 'string' && body.appendNote.trim()) {
    data.notes = [existing.notes, body.appendNote.trim()].filter(Boolean).join('\n').slice(0, 8000);
  }
  if (typeof body.nextAction === 'string') data.nextAction = body.nextAction.slice(0, 4000);
  const application = await prisma.application.update({ where: { id }, data });
  return NextResponse.json({ application: serialize(application) });
}
