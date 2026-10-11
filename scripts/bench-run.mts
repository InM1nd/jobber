/**
 * Local benchmark of the first search run (cold source cache) for one user.
 * DATABASE_URL=<local> GEMINI_API_KEY=… npx tsx scripts/bench-run.mts <userId>
 */
import { getPrisma } from '../lib/db/prisma';
import { startSearchRun, stepSearchRun } from '../lib/search/pipeline';
import { rebuildSources } from '../lib/search/watch';

const userId = process.argv[2] || 'u-alex';
const prisma = getPrisma();
const day = new Date().toISOString().slice(0, 10);
await rebuildSources(userId);
const profile = await prisma.profile.findUniqueOrThrow({ where: { userId } });
await prisma.jobMatch.deleteMany({ where: { userId } });
await prisma.searchRun.deleteMany({ where: { userId } });
await prisma.aiUsage.deleteMany({ where: { userId, day } });
await prisma.cronJob.deleteMany({ where: { name: { startsWith: 'scrape:' } } });
await prisma.jobSource.updateMany({ where: { id: { in: profile.sourceIds } }, data: { lastSuccessAt: null } });
const kinds = await prisma.jobSource.groupBy({ by: ['sourceType'], where: { id: { in: profile.sourceIds } }, _count: true });
console.log('sources', profile.sourceIds.length, kinds.map((k) => `${k.sourceType}:${k._count}`).join(' '));

const t0 = Date.now();
let run = await startSearchRun(userId);
let first: number | null = null, firstN = 0, steps = 0;
const sec = (t: number) => ((t - t0) / 1000).toFixed(1) + 's';
while (run && run.status !== 'done' && run.status !== 'error' && steps < 200) {
  run = (await stepSearchRun(userId, run.id))!;
  steps++;
  const n = await prisma.jobMatch.count({ where: { userId, filtered: false } });
  if (n && first === null) { first = Date.now(); firstN = n; }
  console.log(`${sec(Date.now())} step ${steps} ${run.status} src ${run.sourcesDone}/${run.sourceIds.length} found ${run.jobsFound} scored ${n} queued ${run.queued}`);
}
const end = Date.now();
const calls = await prisma.aiUsage.findFirst({ where: { userId, day, kind: 'score' } });
const final = await prisma.searchRun.findUnique({ where: { id: run!.id } });
const pool = await prisma.job.count({ where: { OR: [{ sourceId: { in: profile.sourceIds } }] } });
const dropped = await prisma.jobMatch.count({ where: { userId, filtered: true, preScore: null } });
const low = await prisma.jobMatch.count({ where: { userId, filtered: true, redFlags: { has: 'Queued for AI scoring' } } });
const lowPre = await prisma.jobMatch.count({ where: { userId, filtered: true, preScore: { not: null } } });
const scores = (await prisma.jobMatch.findMany({ where: { userId, filtered: false }, select: { score: true } })).map((m) => m.score).sort((a, b) => b - a);
console.log(JSON.stringify({ runSources: run?.sourceIds.length, pool, hardDropped: dropped, preScoredNotSent: lowPre, queuedForLater: low, runFirstMatchAt: final?.firstMatchAt ? sec(final.firstMatchAt.getTime()) : null, runAiCalls: (final as any)?.aiCalls, firstMatch: first ? sec(first) : null, firstBatch: firstN, fullRun: sec(end), steps, aiCalls: calls?.count ?? 0, scored: scores.length, top: scores.slice(0, 10), note: run?.note }));
process.exit(0);
