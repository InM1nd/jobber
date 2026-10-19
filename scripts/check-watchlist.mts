// Fetches every source in a plan file once. Usage: npx tsx scripts/check-watchlist.mts plan.json
import { readFileSync, writeFileSync } from 'node:fs';
import { createJobSource } from '../lib/sources/factory.ts';
const plan = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Array<{ company: string; type: string; url: string }>;
const res: any[] = [];
for (const p of plan) {
  if (p.type === 'manual') { res.push({ ...p, ok: false, jobs: 0, err: 'careers page only' }); continue; }
  const t = Date.now();
  try {
    const jobs = await createJobSource({ company: p.company, sourceType: p.type, sourceUrl: p.url }).fetch();
    res.push({ ...p, ok: true, jobs: jobs.length, ms: Date.now() - t, sample: jobs.slice(0, 2).map((j) => `${j.title} (${j.location || '-'}) ${j.url}`) });
  } catch (e) {
    res.push({ ...p, ok: false, jobs: 0, err: (e as Error).message.slice(0, 120) });
  }
  console.log(res.at(-1).ok ? 'OK ' : 'ERR', p.company, p.type, res.at(-1).jobs, res.at(-1).err || '');
  await new Promise((r) => setTimeout(r, 300));
}
writeFileSync(process.argv[3] || '/tmp/check.json', JSON.stringify(res, null, 1));
