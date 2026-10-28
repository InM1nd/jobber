import { NextResponse } from 'next/server';
import { getMatch, getProfile, requireUser, saveCoverLetter } from '@/lib/data/service';
import { editCoverLetter, generateCoverLetter, letterUnverified, type JobData, type UserProfile } from '@/lib/llm/matcher';
import { userChatClient } from '@/lib/ai/shared-client';
import { getPrisma } from '@/lib/db/prisma';
import { aiErrorResponse } from '@/lib/ai/errors';
import { isDemoMode } from '@/lib/demo/mode';
import { stamp, type VersionCause } from '@/lib/ai/meta';
import { replaceParagraph, splitLetter } from '@/lib/apply/letter';

export const instant = false;
export const maxDuration = 60;

type Body = {
  /** "write" (default): a new letter · "paragraph": rewrite one paragraph · "refine": the whole letter by an instruction. */
  mode?: 'write' | 'paragraph' | 'refine';
  paragraph?: number;
  instruction?: string;
};

async function inputs(userId: string, match: NonNullable<Awaited<ReturnType<typeof getMatch>>>) {
  const profile = await getProfile(userId);
  const cv = match.cvId && !isDemoMode() ? await getPrisma().cv.findFirst({ where: { id: match.cvId, userId } }).catch(() => null) : null;
  const profileInput: UserProfile = {
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
    facts: profile.facts || undefined,
    fullName: profile.fullName || undefined,
  };
  const jobInput: JobData = {
    title: match.job.title,
    company: match.job.company,
    location: match.job.location || undefined,
    remote: match.job.remote,
    description: match.job.description,
    salaryMin: match.job.salaryMin || undefined,
    salaryMax: match.job.salaryMax || undefined,
  };
  return { profileInput, jobInput };
}

/** Writes, rewrites one paragraph of, or refines the cover letter. The replaced letter is kept as a version. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { id } = await context.params;
  const body = ((await request.json().catch(() => ({}))) || {}) as Body;
  const match = await getMatch(user.id, id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  const current = match.coverLetter || '';
  const mode = body.mode === 'paragraph' || body.mode === 'refine' ? body.mode : 'write';
  if (mode !== 'write' && !current) return NextResponse.json({ error: 'Write the letter first.' }, { status: 400 });
  const paragraphs = splitLetter(current).paragraphs;
  if (mode === 'paragraph' && !(Number.isInteger(body.paragraph) && body.paragraph! >= 0 && body.paragraph! < paragraphs.length)) {
    return NextResponse.json({ error: 'No such paragraph.' }, { status: 400 });
  }

  try {
    const { profileInput, jobInput } = await inputs(user.id, match);
    const client = userChatClient(user.id, 'write', 'smart', 25_000);
    const instruction = body.instruction?.trim().slice(0, 300) || undefined;
    let letter: string;
    let cause: VersionCause;
    let detail: string | undefined;
    if (mode === 'write') {
      letter = await generateCoverLetter(client, profileInput, jobInput);
      cause = current ? 'rewritten' : 'generated';
    } else if (mode === 'paragraph') {
      const reply = await editCoverLetter(client, profileInput, jobInput, { current, paragraph: body.paragraph, instruction });
      letter = replaceParagraph(current, body.paragraph!, reply);
      cause = 'paragraph';
      detail = `paragraph ${body.paragraph! + 1}${instruction ? `: ${instruction}` : ''}`;
    } else {
      letter = await editCoverLetter(client, profileInput, jobInput, { current, instruction });
      cause = 'rewritten';
      detail = instruction;
    }
    const unverified = letterUnverified(letter, profileInput, jobInput);
    const meta = stamp('letter', unverified, { cause, ...(detail ? { detail: detail.slice(0, 80) } : {}) });
    const saved = await saveCoverLetter(user.id, id, letter, meta);
    return NextResponse.json({ letter, meta, history: historyOf(saved) });
  } catch (error) {
    return aiErrorResponse(error);
  }
}

/**
 * PUT {text} saves a hand edit · {restore: n} brings back version n of the history.
 * Either way the letter it replaces is kept as a version.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { id } = await context.params;
  const body = ((await request.json().catch(() => ({}))) || {}) as { text?: string; restore?: number };
  const match = await getMatch(user.id, id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  if (typeof body.restore === 'number') {
    const version = match.aiMeta?.letterHistory?.[body.restore];
    if (!version) return NextResponse.json({ error: 'No such version.' }, { status: 404 });
    // Restoring keeps the guard flags of a version only if it was AI text; recheck to be safe.
    const { profileInput, jobInput } = await inputs(user.id, match);
    const meta = { ...stamp('letter', letterUnverified(version.text, profileInput, jobInput), { cause: 'restored' as const }), v: version.v || stamp('letter').v };
    const saved = await saveCoverLetter(user.id, id, version.text, meta);
    return NextResponse.json({ letter: version.text, meta, history: historyOf(saved) });
  }
  const text = typeof body.text === 'string' ? body.text.slice(0, 8000).trim() : '';
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
  // A hand edit is the user's own: no guard flags, current prompt version.
  const meta = stamp('letter', [], { cause: 'edited' });
  const saved = await saveCoverLetter(user.id, id, text, meta);
  return NextResponse.json({ letter: text, meta, history: historyOf(saved) });
}

function historyOf(saved: unknown) {
  const raw = (saved as { aiMeta?: { letterHistory?: unknown } } | null)?.aiMeta?.letterHistory;
  return Array.isArray(raw) ? raw : [];
}
