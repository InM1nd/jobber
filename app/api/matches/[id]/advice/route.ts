import { NextResponse } from 'next/server';
import { getMatch, getProfile, requireUser, saveMatchExtras } from '@/lib/data/service';
import { adviseCv, tailorCvText } from '@/lib/ai/cv-advice';
import { consumeOne } from '@/lib/ai/quota';
import { aiErrorResponse } from '@/lib/ai/errors';

export const instant = false;
export const maxDuration = 60;

/** POST {kind: "advice" | "cv", refresh?: boolean}. Results are cached on the match. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { kind?: string; refresh?: boolean };
  const kind = body.kind === 'cv' ? 'cv' : 'advice';

  const match = await getMatch(user.id, id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  if (!body.refresh) {
    if (kind === 'advice' && match.cvAdvice) return NextResponse.json({ advice: match.cvAdvice, cached: true });
    if (kind === 'cv' && match.tailoredCv) return NextResponse.json({ tailoredCv: match.tailoredCv, cached: true });
  }

  const profile = await getProfile(user.id);
  if (!profile.cvText) return NextResponse.json({ error: 'Upload your CV first.' }, { status: 400 });
  const job = { title: match.job.title, company: match.job.company, description: match.job.description };

  try {
    await consumeOne(user.id, 'write');
    if (kind === 'advice') {
      const advice = await adviseCv(profile.cvText, job);
      await saveMatchExtras(user.id, id, { cvAdvice: advice });
      return NextResponse.json({ advice });
    }
    const tailoredCv = await tailorCvText(profile.cvText, job);
    await saveMatchExtras(user.id, id, { tailoredCv });
    return NextResponse.json({ tailoredCv });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
