import { after, NextResponse } from 'next/server';
import { requireUser } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';
import { cleanReason, decide, setSkipReason, undo, type Decision } from '@/lib/tracker/decide';
import { prepareApplyPack } from '@/lib/tracker/apply-pack';

export const instant = false;
export const maxDuration = 60;

const DECISIONS: Decision[] = ['apply', 'skip', 'later'];

/**
 * Review: {decision: apply|skip|later, reason?} · {action: "reason", reason} · {action: "undo"}.
 * "apply" answers at once; the letter and the Telegram apply pack are prepared after the response.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { decision?: string; action?: string; reason?: unknown };

  if (body.action === 'undo') {
    return (await undo(user.id, id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Nothing to undo' }, { status: 404 });
  }
  if (body.action === 'reason') {
    return (await setSkipReason(user.id, id, cleanReason(body.reason))) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not skipped' }, { status: 400 });
  }
  const decision = DECISIONS.find((d) => d === body.decision);
  if (!decision) return NextResponse.json({ error: 'decision must be apply, skip or later' }, { status: 400 });

  const result = await decide(user.id, id, decision, cleanReason(body.reason));
  if (!result) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  if (result.decision === 'apply' && 'applicationId' in result && result.applicationId) {
    const appId = result.applicationId;
    after(() => prepareApplyPack(user.id, id, appId).catch((e) => console.error('apply pack', e instanceof Error ? e.message : e)));
  }
  return NextResponse.json({ ok: true, ...result });
}
