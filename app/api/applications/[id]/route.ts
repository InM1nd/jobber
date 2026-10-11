import { NextResponse } from 'next/server';
import { requireUser, updateApplication } from '@/lib/data/service';

export const instant = false;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  const updated = await updateApplication(user.id, id, {
    status: data.status ? String(data.status) : undefined,
    notes: data.notes === undefined ? undefined : String(data.notes),
    followUpSent: data.followUpSent === undefined ? undefined : Boolean(data.followUpSent),
  });

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ application: updated });
}
