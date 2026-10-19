import { getProfile } from '@/lib/data/service';
import { getPrisma } from '@/lib/db/prisma';
import { checkUrl, fetchJobPage } from '@/lib/jobs/add-by-link';
import { pageText } from '@/lib/jobs/extract';
import { fetchQuestions } from './questions';
import { generateDrafts, type ApplicationDrafts } from './drafts';

export class PrepareError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Fetch the form questions, draft answers (Gemini, normal limits), save them on the application. Never submits. */
export async function prepareApplication(userId: string, id: string): Promise<ApplicationDrafts> {
  const prisma = getPrisma();
  const app = await prisma.application.findFirst({ where: { id, userId }, include: { job: { include: { source: true } } } });
  if (!app) throw new PrepareError('Not found', 404);
  const job = app.job;
  const { source, questions } = await fetchQuestions({ url: job?.url || app.url, sourceType: job?.source.sourceType, sourceUrl: job?.source.sourceUrl, externalId: job?.externalId });
  let description = job?.description || '';
  if (description.length < 300 && app.url) {
    try { description = pageText(await fetchJobPage(checkUrl(app.url)), ['main', 'article', 'body']).slice(0, 8000) || description; } catch {}
  }
  const profile = await getProfile(userId);
  const match = app.jobId ? await prisma.jobMatch.findUnique({ where: { userId_jobId: { userId, jobId: app.jobId } }, select: { cvId: true } }) : null;
  const cv = match?.cvId ? await prisma.cv.findFirst({ where: { id: match.cvId, userId } }) : await prisma.cv.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const cvText = cv?.text || profile.cvText || '';
  if (!cvText) throw new PrepareError('Upload a CV in your profile first.', 422);
  const drafts = await generateDrafts(userId, {
    company: app.company, role: app.role, description: description || `${app.role} at ${app.company}`, cvText,
    writingRules: profile.writingRules ?? null, notes: app.notes, questions,
  }, source);
  await prisma.application.update({ where: { id }, data: { coverLetter: JSON.stringify(drafts) } });
  return drafts;
}
