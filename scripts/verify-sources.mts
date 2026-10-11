// Live check of every source adapter. Usage: npx tsx scripts/verify-sources.ts
import { createJobSource } from '../lib/sources/factory.ts';
import { KEYWORD_BOARDS, keywordSourceUrl } from '../lib/sources/boards.ts';
import { SEED_COMPANIES, boardUrl } from '../lib/companies/seed.ts';

const checks: Array<{ name: string; type: string; url: string }> = [];
for (const b of KEYWORD_BOARDS) {
  const place = b === 'bundesagentur' ? { city: 'Berlin', country: 'Germany' } : b === 'themuse' ? {} : { city: 'Vienna', country: 'Austria' };
  checks.push({ name: `${b} "frontend"`, type: b, url: keywordSourceUrl(b, 'frontend', place) });
}
checks.push({ name: 'bundesagentur "pflege" Berlin', type: 'bundesagentur', url: keywordSourceUrl('bundesagentur', 'pflege', { city: 'Berlin' }) });
checks.push({ name: 'remotive "marketing"', type: 'remotive', url: keywordSourceUrl('remotive', 'marketing') });
const seen = new Set<string>();
for (const c of SEED_COMPANIES) {
  if (seen.has(c.ats)) continue;
  seen.add(c.ats);
  checks.push({ name: `${c.ats} ${c.name}`, type: c.ats, url: boardUrl(c) });
}

for (const c of checks) {
  const t = Date.now();
  try {
    const jobs = await createJobSource({ company: c.name, sourceType: c.type, sourceUrl: c.url }).fetch();
    const sample = jobs[0];
    console.log(`OK   ${c.name.padEnd(36)} ${String(jobs.length).padStart(4)} jobs ${Date.now() - t}ms  e.g. ${sample ? `${sample.title.slice(0, 40)} @ ${sample.company || c.name} (${sample.location || '-'})` : ''}`);
  } catch (e) {
    console.log(`FAIL ${c.name.padEnd(36)} ${(e as Error).message.slice(0, 80)}`);
  }
}
