// One-time: link owner's tracker applications to matched jobs (hides them from Matches). --apply to write.
import { findJobFor, sameCompany, sameRole } from '../lib/tracker/link';
const S = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1';
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const h = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const get = async (p: string) => (await fetch(S + p, { headers: h })).json();
console.log('sanity', sameCompany('Bitpanda GmbH', 'bitpanda'), sameRole('Frontend Developer (m/w/d)', 'Frontend Engineer'), !sameRole('Frontend Engineer', 'Backend Engineer'), !sameCompany('Linear', 'Linearity GmbH'));
const uid = (await get('/User?telegramId=eq.336128859&select=id'))[0].id;
const apps = await get(`/Application?userId=eq.${uid}&select=id,company,role,url,jobId,status`);
const ms = await get(`/JobMatch?userId=eq.${uid}&select=id,filtered,score,job:Job(id,url,title,company,source:JobSource(company))&limit=5000`);
const jobs = ms.map((m: any) => ({ id: m.job.id, url: m.job.url, title: m.job.title, company: m.job.company || m.job.source.company, filtered: m.filtered, score: m.score }));
const taken = new Set(apps.filter((a: any) => a.jobId).map((a: any) => a.jobId));
const links: any[] = [];
for (const a of apps.filter((a: any) => !a.jobId)) {
  const j = findJobFor(a, jobs.filter((j: any) => !taken.has(j.id)));
  if (!j) continue;
  taken.add(j.id);
  links.push({ a, j });
}
const visible = links.filter((l) => !(l.j as any).filtered);
console.log(`apps ${apps.length}, matches ${ms.length} (visible ${ms.filter((m: any) => !m.filtered).length}); links ${links.length}, of which visible in Matches: ${visible.length}`);
for (const { a, j } of links) console.log(`${(j as any).filtered ? '   ' : 'VIS'} [${a.status}] ${a.company} — ${a.role}  ⇢  ${j.company} — ${j.title} (${(j as any).score})`);
if (process.argv.includes('--apply')) {
  for (const { a, j } of links) {
    const r = await fetch(`${S}/Application?id=eq.${a.id}&jobId=is.null`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ jobId: j.id }) });
    if (!r.ok) console.error('fail', a.id, r.status);
  }
  console.log('applied');
}
const vis = jobs.filter((j: any) => !j.filtered && ![...links].some((l) => l.j.id === j.id));
console.log('\nstill visible:'); for (const j of vis) console.log(` ${j.company} — ${j.title} | ${j.url}`);
