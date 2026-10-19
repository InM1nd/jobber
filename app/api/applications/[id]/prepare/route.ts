import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/data/service';
import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';
import { aiErrorResponse } from '@/lib/ai/errors';
import { STANDARD_QUESTIONS } from '@/lib/apply/questions';
import { parseDrafts, type ApplicationDrafts } from '@/lib/apply/format';
import { prepareApplication, PrepareError } from '@/lib/apply/prepare';

export const instant = false;
export const maxDuration = 60;

/**
 * "Prepare application": fetches the job's real form questions (Greenhouse/Workable/Recruitee) or a standard set,
 * drafts answers with Gemini (normal limits) and saves them on the application. Never submits anything.
 * POST → generate · PUT {items} → save edits.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { id } = await context.params;
  if (isDemoMode()) {
    const drafts: ApplicationDrafts = { v: 1, source: 'standard', generatedAt: new Date().toISOString(), items: STANDARD_QUESTIONS.map((q) => ({ ...q, label: q.label.replace('{company}', 'the company'), answer: 'Demo draft.' })) };
    return NextResponse.json({ drafts });
  }
  try {
    return NextResponse.json({ drafts: await prepareApplication(user.id, id) });
  } catch (error) {
    if (error instanceof PrepareError) return NextResponse.json({ error: error.message }, { status: error.status });
    return aiErrorResponse(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { items?: Array<{ id: string; answer: string }> } | null;
  if (!body?.items) return NextResponse.json({ error: 'items required' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const prisma = getPrisma();
  const app = await prisma.application.findFirst({ where: { id, userId: user.id }, select: { coverLetter: true } });
  const current = parseDrafts(app?.coverLetter);
  if (!app || !current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const edits = new Map(body.items.map((i) => [i.id, String(i.answer ?? '').slice(0, 8000)]));
  const next: ApplicationDrafts = { ...current, editedAt: new Date().toISOString(), items: current.items.map((it) => (edits.has(it.id) ? { ...it, answer: edits.get(it.id)! } : it)) };
  await prisma.application.update({ where: { id }, data: { coverLetter: JSON.stringify(next) } });
  return NextResponse.json({ ok: true, drafts: next });
}
