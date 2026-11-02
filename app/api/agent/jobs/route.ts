import { NextResponse } from 'next/server';
import { checkAgentAuth, getOwner } from '@/lib/agent/api';
import { addAgentJob, isComplete, parseAgentJob, type AgentJobResult } from '@/lib/agent/jobs';
import { getPrisma } from '@/lib/db/prisma';
import { QUEUED_FLAG, scoreUserBatch } from '@/lib/search/score';

export const instant = false;
export const maxDuration = 60;

const MAX_ITEMS = 25;
/** Stop taking new items after this; the rest come back with retry: true. */
const INGEST_BUDGET_MS = 38_000;

/** GET ?jobIds=a,b: what Jobber made of jobs sent earlier (queued, skipped by the rules with a reason, or scored). */
export async function GET(request: Request) {
  const denied = checkAgentAuth(request);
  if (denied) return denied;
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner user not found' }, { status: 404 });
  const ids = (new URL(request.url).searchParams.get('jobIds') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  if (!ids.length) return NextResponse.json({ error: 'jobIds is required' }, { status: 400 });
  const rows = await getPrisma().jobMatch.findMany({
    where: { userId: owner.id, jobId: { in: ids } },
    select: { id: true, jobId: true, score: true, filtered: true, redFlags: true, reasons: true, job: { select: { title: true, company: true, url: true } } },
  });
  const base = process.env.NEXT_PUBLIC_APP_URL || '';
  return NextResponse.json({
    items: rows.map((m) => ({
      jobId: m.jobId,
      matchId: m.id,
      title: m.job.title,
      company: m.job.company,
      url: m.job.url,
      state: !m.filtered ? 'scored' : m.redFlags.includes(QUEUED_FLAG) ? 'queued' : 'skipped',
      score: m.filtered ? null : m.score,
      reasons: m.filtered ? [] : m.reasons,
      redFlags: m.redFlags.filter((f) => f !== QUEUED_FLAG),
      link: base ? `${base}/dashboard/matches/${m.id}` : null,
    })),
  });
}

/**
 * POST: vacancies an agent found ({...} or {items:[...]}, max 25). Each one is stored once in the job
 * pool (deduped by link, then company + title + place) and queued for the owner's scoring; it shows up
 * in Matches, not in the tracker. Send title + company + description when you have them: no page fetch,
 * no AI extraction. One scoring request runs right away unless score: false.
 */
export async function POST(request: Request) {
  const denied = checkAgentAuth(request);
  if (denied) return denied;
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner user not found' }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const started = Date.now();
  const single = !Array.isArray(body.items);
  const raw = single ? [body] : (body.items as unknown[]);
  if (raw.length > MAX_ITEMS) return NextResponse.json({ error: `At most ${MAX_ITEMS} items per request` }, { status: 400 });
  const finder = typeof body.source === 'string' && !single ? body.source : undefined;

  const results: Array<AgentJobResult & { index: number }> = [];
  // Complete items first: they are cheap, so a slow page fetch can't starve them.
  const parsed = raw.map((r, index) => ({ index, f: parseAgentJob(r, finder) }));
  const cheap = (p: (typeof parsed)[number]) => !('error' in p.f) && isComplete(p.f);
  parsed.sort((a, b) => Number(cheap(b)) - Number(cheap(a)));
  for (const { index, f } of parsed) {
    if ('error' in f) {
      results.push({ index, error: f.error });
      continue;
    }
    if (Date.now() - started > INGEST_BUDGET_MS) {
      results.push({ index, error: 'Out of time for this request, send it again.', retry: true });
      continue;
    }
    try {
      results.push({ index, ...(await addAgentJob(owner.id, f)) });
    } catch (e) {
      console.error('agent job', e instanceof Error ? e.message : e);
      results.push({ index, error: e instanceof Error ? e.message.slice(0, 200) : 'Failed', retry: true });
    }
  }
  results.sort((a, b) => a.index - b.index);

  const stored = results.filter((r) => 'jobId' in r);
  let scoring: { scored: number; queued: number; stoppedBy: string | null } | null = null;
  if (body.score !== false && stored.length) {
    const r = await scoreUserBatch(owner.id, { maxCalls: 1, deadline: started + 55_000, concurrency: 1 }).catch((e) => {
      console.error('agent job scoring', e instanceof Error ? e.message : e);
      return null;
    });
    if (r) scoring = { scored: r.scored, queued: r.queued, stoppedBy: r.stoppedBy };
  }

  const summary = {
    created: stored.filter((r) => 'status' in r && r.status === 'created').length,
    duplicates: stored.filter((r) => 'status' in r && r.status === 'duplicate').length,
    errors: results.filter((r) => 'error' in r).length,
    scoring,
  };
  if (single) {
    const r = results[0];
    if ('error' in r) return NextResponse.json({ error: r.error, retry: r.retry ?? false }, { status: r.retry ? 503 : 400 });
    return NextResponse.json({ ...summary, job: r }, { status: r.status === 'created' ? 201 : 200 });
  }
  return NextResponse.json({ ...summary, results });
}
