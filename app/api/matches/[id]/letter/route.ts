import { NextResponse } from 'next/server';
import { getMatch, getProfile, requireUser, saveCoverLetter } from '@/lib/data/service';
import { generateCoverLetter } from '@/lib/llm/matcher';
import { userChatClient } from '@/lib/ai/shared-client';
import { getPrisma } from '@/lib/db/prisma';
import { aiErrorResponse } from '@/lib/ai/errors';

export const instant = false;
export const maxDuration = 60;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { id } = await context.params;
  const match = await getMatch(user.id, id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  const profile = await getProfile(user.id);
  try {
    const cv = match.cvId ? await getPrisma().cv.findFirst({ where: { id: match.cvId, userId: user.id } }).catch(() => null) : null;
    const letter = await generateCoverLetter(userChatClient(user.id, 'write', 'smart', 25_000), {
      cvText: cv?.text || profile.cvText || undefined,
      skills: profile.skills,
      location: profile.location || undefined,
      remoteOnly: profile.remoteOnly,
      languages: profile.languages,
      salaryMin: profile.salaryMin || undefined,
      salaryMax: profile.salaryMax || undefined,
      stackKeywords: profile.stackKeywords,
      skillGaps: profile.skillGaps,
      writingRules: profile.writingRules || undefined,
    }, {
      title: match.job.title,
      company: match.job.company,
      location: match.job.location || undefined,
      remote: match.job.remote,
      description: match.job.description,
      salaryMin: match.job.salaryMin || undefined,
      salaryMax: match.job.salaryMax || undefined,
    });

    await saveCoverLetter(user.id, id, letter);
    return NextResponse.json({ letter });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
