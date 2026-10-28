import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';
import { aiErrorResponse } from '@/lib/ai/errors';
import { handleReply } from '@/lib/replies/handle';

export const instant = false;
export const maxDuration = 60;

/**
 * POST {text, applicationId?, apply?} — reads an employer reply: what it is, what they ask,
 * which application, and a draft answer. With apply: updates that application's status and notes.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { text?: string; applicationId?: string; apply?: boolean } | null;
  const text = body?.text?.trim() || '';
  if (text.length < 20) return NextResponse.json({ error: 'Paste the whole message.' }, { status: 400 });
  if (isDemoMode()) {
    return NextResponse.json({
      reading: { kind: 'interview', summary: 'Invites you to a 30-minute call and asks for your notice period.', questions: ['What is your notice period?'], interviewAt: null, company: 'Acme', role: null, applicationId: body?.applicationId ?? null, draft: 'Hi,\n\nThank you, happy to talk. I can start from [fill in: start date].\n\nBest,\nOleksandr', unverified: [] },
      application: null, previousStatus: null, newStatus: null,
    });
  }
  try {
    return NextResponse.json(await handleReply(user.id, text.slice(0, 12_000), { applicationId: body?.applicationId, apply: Boolean(body?.apply) }));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
