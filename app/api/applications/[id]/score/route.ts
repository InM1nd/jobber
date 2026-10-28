import { NextResponse } from 'next/server';
import { getProfile, requireUser } from '@/lib/data/service';
import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';
import { demoStore } from '@/lib/demo/store';
import { aiErrorResponse } from '@/lib/ai/errors';
import { checkUrl, extractJob, fetchJobPage, NeedTextError, saveManualJob } from '@/lib/jobs/add-by-link';
import { scoreOne } from '@/lib/search/score';
import { adviseCv } from '@/lib/ai/cv-advice';
import { parseAiMeta, stamp } from '@/lib/ai/meta';
import { gapNames, parseStoredRequirements } from '@/lib/search/requirements';

export const instant = false;
export const maxDuration = 60;

/**
 * "Score fit" for a tracker application. Body: {text?} (pasted description) · {refetch?: true}.
 * Uses the linked job when there is one, else fetches the listing URL (same fetcher as "Add job by link").
 * Scores it with the normal pipeline (profile + best CV), adds CV tips, saves score/whyFit/risks on the application.
 * The resulting match is linked to the application, so it stays hidden from Matches.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { text?: string; refetch?: boolean };
  const text = body.text?.trim() || '';

  if (isDemoMode()) {
    const fit = {
      score: 81, reasons: ['React + TypeScript product work you already do daily', 'Vienna hybrid, English-speaking team'], redFlags: ['Asks for 5+ years; you have 5 since 2021'],
      subScores: { role: 88, skills: 84, seniority: 62, location: 100, language: 90, salary: 70 },
      cvAdvice: { verdict: 'Strong fit; lead with the component library and the 300 tests.', emphasize: ['Component library at marswalk media', '~300 automated tests in CI'], add: ['Mention the Next.js + Sanity migration in the summary'], reword: [], missingKeywords: ['Storybook', 'Playwright'], doNotClaim: ['Storybook'] },
      cvLabel: 'Frontend Engineer', scoredAt: new Date().toISOString(),
    };
    const app = demoStore.updateApplication(id, { fit, score: fit.score, updatedAt: new Date().toISOString() });
    return app ? NextResponse.json({ application: app }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const prisma = getPrisma();
  const app = await prisma.application.findFirst({ where: { id, userId: user.id } });
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    let jobId = app.jobId;
    if (text) {
      const job = await extractJob(user.id, { text });
      jobId = (await saveManualJob(user.id, { ...job, company: job.company || app.company, title: job.title || app.role }, app.url || undefined)).id;
    } else if (!jobId || body.refetch) {
      if (!app.url) return NextResponse.json({ error: 'No listing link saved. Paste the job description instead.', code: 'need_text' }, { status: 422 });
      let url: URL;
      try {
        url = checkUrl(app.url);
      } catch {
        return NextResponse.json({ error: 'That link can’t be fetched. Paste the job description instead.', code: 'need_text' }, { status: 422 });
      }
      const job = await extractJob(user.id, { html: await fetchJobPage(url) });
      jobId = (await saveManualJob(user.id, { ...job, company: job.company || app.company, title: job.title || app.role }, url.toString())).id;
    }
    if (jobId !== app.jobId) await prisma.application.update({ where: { id }, data: { jobId } });
    await scoreOne(user.id, jobId!);
    const match = await prisma.jobMatch.findUnique({ where: { userId_jobId: { userId: user.id, jobId: jobId! } }, include: { job: true } });
    if (!match || match.score <= 0) return NextResponse.json({ error: 'Scoring didn’t return a result. Try again in a minute.' }, { status: 502 });
    if (match.filtered) await prisma.jobMatch.update({ where: { id: match.id }, data: { filtered: false } });

    // CV tips for the CV the scorer picked (best of the user's CVs). Optional: a failure keeps the score.
    try {
      const profile = await getProfile(user.id);
      const cv = match.cvId ? await prisma.cv.findFirst({ where: { id: match.cvId, userId: user.id } }) : null;
      const cvText = cv?.text || profile.cvText;
      if (cvText) {
        const gaps = gapNames(parseStoredRequirements(match.requirements), 6);
        const advice = await adviseCv(user.id, cvText, { title: match.job.title, company: match.job.company || app.company, description: match.job.description }, gaps);
        await prisma.jobMatch.update({ where: { id: match.id }, data: { cvAdvice: advice as object, aiMeta: { ...parseAiMeta(match.aiMeta), advice: stamp('advice') } as object } });
      }
    } catch {}

    const aiWhy = match.reasons.length ? `AI: ${match.reasons.join('; ')}` : null;
    const aiRisk = match.redFlags.length ? `AI flags: ${match.redFlags.join('; ')}` : null;
    const keptRisks = (app.risks || '').split('\n').filter((l) => !l.startsWith('AI flags:')).join('\n').trim();
    await prisma.application.update({
      where: { id },
      data: {
        score: match.score,
        ...(aiWhy && (!app.whyFit || app.whyFit.startsWith('AI:')) ? { whyFit: aiWhy } : {}),
        risks: [keptRisks, aiRisk].filter(Boolean).join('\n') || null,
      },
    });
    return NextResponse.json({ ok: true, score: match.score });
  } catch (e) {
    if (e instanceof NeedTextError) return NextResponse.json({ error: e.message, code: 'need_text' }, { status: 422 });
    return aiErrorResponse(e);
  }
}
