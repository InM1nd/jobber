import { NextResponse } from 'next/server';
import { requireUser, saveProfile } from '@/lib/data/service';
import { getPrisma } from '@/lib/db/prisma';

export const instant = false;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { id } = await context.params;
  const { label } = (await request.json().catch(() => ({}))) as { label?: string };
  const clean = String(label || '').trim().slice(0, 40);
  if (!clean) return NextResponse.json({ error: 'Give the CV a short name' }, { status: 400 });
  const res = await getPrisma().cv.updateMany({ where: { id, userId: user.id }, data: { label: clean } });
  return res.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { id } = await context.params;
  const prisma = getPrisma();
  await prisma.cv.deleteMany({ where: { id, userId: user.id } });
  await prisma.jobMatch.updateMany({ where: { userId: user.id, cvId: id }, data: { cvId: null } });
  const first = await prisma.cv.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  await saveProfile(user.id, { cvText: first?.text ?? null, cvFileName: first?.fileName ?? null });
  return NextResponse.json({ ok: true });
}
