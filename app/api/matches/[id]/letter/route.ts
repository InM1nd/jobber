import { NextResponse } from 'next/server';
import { getActiveKey, getMatch, getProfile, requireUser, saveCoverLetter } from '@/lib/data/service';
import { createLLMClient } from '@/lib/llm/provider';
import { generateCoverLetter } from '@/lib/llm/matcher';
import type { LLMProvider } from '@/lib/llm/provider';

export const instant = false;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { id } = await context.params;
  const match = await getMatch(user.id, id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  const key = await getActiveKey(user.id);
  if (!key) {
    return NextResponse.json(
      { error: 'Add your own API key in Settings before generating a letter.' },
      { status: 400 },
    );
  }

  const profile = await getProfile(user.id);
  try {
    const client = await createLLMClient({
      provider: key.provider as LLMProvider,
      apiKey: key.apiKey,
    });
    const letter = await generateCoverLetter(client, {
      cvText: profile.cvText || undefined,
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
    console.error('Cover letter generation failed');
    const raw = error instanceof Error ? error.message : 'Generation failed';
    const message = raw.split(key.apiKey).join('[redacted]');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
