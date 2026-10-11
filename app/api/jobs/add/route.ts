import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/data/service';
import { getPrisma } from '@/lib/db/prisma';
import { aiErrorResponse } from '@/lib/ai/errors';
import { isDemoMode } from '@/lib/demo/mode';
import { checkUrl, extractJob, fetchJobPage, NeedTextError, saveManualJob } from '@/lib/jobs/add-by-link';
import { scoreOne } from '@/lib/search/score';

export const instant = false;
export const maxDuration = 60;

/**
 * "Add job by link": {url} → fetch that one page now (user-initiated), or {text, url?} when the
 * page was blocked. Saves the job for this user and scores it.
 * Errors with code 'need_text' tell the client to show the paste-text fallback.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: 'Not available in demo mode' }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { url?: string; text?: string } | null;
  const rawUrl = body?.url?.trim() || '';
  const text = body?.text?.trim() || '';
  if (!rawUrl && !text) return NextResponse.json({ error: 'Paste a link or the job text' }, { status: 400 });

  let url: URL | undefined;
  try {
    if (rawUrl) url = checkUrl(rawUrl);
    const job = text ? await extractJob(user.id, { text }) : await extractJob(user.id, { html: await fetchJobPage(url!) });
    const saved = await saveManualJob(user.id, job, url?.toString());
    let scoreError: string | undefined;
    try {
      await scoreOne(user.id, saved.id);
    } catch (e) {
      scoreError = e instanceof Error ? e.message : 'Scoring failed';
    }
    const match = await getPrisma().jobMatch.findUnique({ where: { userId_jobId: { userId: user.id, jobId: saved.id } }, select: { id: true, score: true } });
    return NextResponse.json({ jobId: saved.id, matchId: match?.id, score: match?.score, title: saved.title, company: saved.company, scoreError });
  } catch (e) {
    if (e instanceof NeedTextError) return NextResponse.json({ error: e.message, code: 'need_text' }, { status: 422 });
    return aiErrorResponse(e);
  }
}
