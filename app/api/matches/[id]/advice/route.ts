import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getMatch, getProfile, requireUser, saveMatchExtras } from '@/lib/data/service';
import { adviseCv, tailorCvText } from '@/lib/ai/cv-advice';
import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';
import { aiErrorResponse } from '@/lib/ai/errors';
import { stamp } from '@/lib/ai/meta';
import { factSources, unverifiedFacts } from '@/lib/ai/fact-guard';
import { gapNames } from '@/lib/search/requirements';

export const instant = false;
export const maxDuration = 60;

/** POST {kind: "advice" | "cv", refresh?: boolean}. Results are cached on the match. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { kind?: string; refresh?: boolean; cvId?: string };
  const kind = body.kind === 'cv' ? 'cv' : 'advice';

  const match = await getMatch(user.id, id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  // Advice is cached for the CV the match uses; another CV = fresh advice.
  const cvId = body.cvId || match.cvId || null;
  const switched = Boolean(body.cvId && body.cvId !== match.cvId);
  if (!body.refresh && !switched) {
    if (kind === 'advice' && match.cvAdvice) return NextResponse.json({ advice: match.cvAdvice, meta: match.aiMeta?.advice ?? null, cached: true });
    if (kind === 'cv' && match.tailoredCv) return NextResponse.json({ tailoredCv: match.tailoredCv, meta: match.aiMeta?.tailoredCv ?? null, cached: true });
  }

  const profile = await getProfile(user.id);
  const cv = cvId && !isDemoMode() ? await getPrisma().cv.findFirst({ where: { id: cvId, userId: user.id } }) : null;
  const cvText = cv?.text || profile.cvText;
  if (!cvText) return NextResponse.json({ error: 'Upload your CV first.' }, { status: 400 });
  const job = { title: match.job.title, company: match.job.company, description: match.job.description };

  try {
    if (switched && !isDemoMode()) await getPrisma().jobMatch.update({ where: { id }, data: { cvId, cvAdvice: Prisma.DbNull, tailoredCv: null } });
    if (kind === 'advice') {
      const advice = await adviseCv(user.id, cvText, job, gapNames(match.requirements, 6));
      const meta = stamp('advice');
      await saveMatchExtras(user.id, id, { cvAdvice: advice }, { advice: meta });
      return NextResponse.json({ advice, meta });
    }
    const tailoredCv = await tailorCvText(user.id, cvText, job);
    // A tailored CV may only say what the CV, your facts and skills say (not what the job asks for).
    const unverified = unverifiedFacts(tailoredCv, factSources([cvText, profile.facts, profile.fullName, profile.location, ...profile.skills, ...profile.languages]));
    const meta = stamp('tailoredCv', unverified);
    await saveMatchExtras(user.id, id, { tailoredCv }, { tailoredCv: meta });
    return NextResponse.json({ tailoredCv, meta });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
