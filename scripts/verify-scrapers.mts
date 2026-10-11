import { PLATFORMS, scrapePlatform } from '../lib/scrapers/platforms';
const KW = ['frontend developer', 'full stack developer', 'product engineer'];
const de = (t: string) => (t.match(/\b(und|die|der|wir|sie|mit|für|bei|ihre|unser|das|ist|eine?)\b/gi) || []).length;
const en = (t: string) => (t.match(/\b(and|the|we|you|with|for|our|your|is|are|of|to)\b/gi) || []).length;
const lang = (t: string) => { const d = de(t), e = en(t); return d + e < 5 ? '?' : e > d ? 'en' : 'de'; };
for (const p of PLATFORMS) {
  if (p.status !== 'enabled') { console.log(`${p.name}: ${p.status.toUpperCase()} — ${p.note}`); continue; }
  const all = new Map<string, any>();
  try {
    for (const k of KW) for (const j of await scrapePlatform(p.id, k, 'Wien', { details: 4 })) all.set(j.externalId, j);
  } catch (e) { console.log(`${p.name}: ERROR ${(e as Error).message}`); continue; }
  const jobs = [...all.values()];
  const vienna = jobs.filter((j) => /wien|vienna/i.test(j.location || ''));
  const withDesc = jobs.filter((j) => j.description.length > 300);
  const enTitle = jobs.filter((j) => !/\(m\/w|\bm\/w\/|\*in\b|:in\b|entwickler|mitarbeiter/i.test(j.title) && /\b(engineer|developer|lead|senior|junior)\b/i.test(j.title));
  const enDesc = withDesc.filter((j) => lang(j.description) === 'en');
  console.log(`${p.name}: WORKS — ${jobs.length} unique, ${vienna.length} in Vienna, English titles ${enTitle.length}/${jobs.length}, English descriptions ${enDesc.length}/${withDesc.length} fetched; pii=${jobs.filter((j) => /@\w+\./.test(j.description)).length}`);
  for (const j of jobs.slice(0, 3)) console.log('   ·', j.title, '|', j.company, '|', j.location, '|', j.postedAt?.toISOString().slice(0, 10), '|', j.description.length, lang(j.description));
}
