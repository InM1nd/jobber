// Builds lib/companies/seed.json from scripts/seed-candidates.json.
// Keeps only boards that answer with >=1 open job right now, and tags each
// company with the cities/countries its jobs are actually in.
import fs from 'node:fs';
const C = JSON.parse(fs.readFileSync('scripts/seed-candidates.json', 'utf8'));
const UA = { 'user-agent': 'Jobber/1.0 (+https://jobber-kohl.vercel.app)' };

const COUNTRY = {
  austria: 'Austria', österreich: 'Austria', vienna: 'Austria', wien: 'Austria', graz: 'Austria', linz: 'Austria', salzburg: 'Austria', innsbruck: 'Austria', klagenfurt: 'Austria',
  germany: 'Germany', deutschland: 'Germany', berlin: 'Germany', munich: 'Germany', münchen: 'Germany', hamburg: 'Germany', frankfurt: 'Germany', cologne: 'Germany', köln: 'Germany', stuttgart: 'Germany', düsseldorf: 'Germany', leipzig: 'Germany',
  switzerland: 'Switzerland', zurich: 'Switzerland', zürich: 'Switzerland', geneva: 'Switzerland', basel: 'Switzerland',
  netherlands: 'Netherlands', amsterdam: 'Netherlands', rotterdam: 'Netherlands', eindhoven: 'Netherlands',
  'united kingdom': 'United Kingdom', uk: 'United Kingdom', london: 'United Kingdom', manchester: 'United Kingdom', edinburgh: 'United Kingdom',
  ireland: 'Ireland', dublin: 'Ireland', france: 'France', paris: 'France', lyon: 'France',
  spain: 'Spain', madrid: 'Spain', barcelona: 'Spain', portugal: 'Portugal', lisbon: 'Portugal', porto: 'Portugal',
  italy: 'Italy', milan: 'Italy', rome: 'Italy', poland: 'Poland', warsaw: 'Poland', krakow: 'Poland', kraków: 'Poland', wroclaw: 'Poland',
  czechia: 'Czechia', 'czech republic': 'Czechia', prague: 'Czechia', brno: 'Czechia', hungary: 'Hungary', budapest: 'Hungary',
  sweden: 'Sweden', stockholm: 'Sweden', gothenburg: 'Sweden', denmark: 'Denmark', copenhagen: 'Denmark', norway: 'Norway', oslo: 'Norway',
  finland: 'Finland', helsinki: 'Finland', estonia: 'Estonia', tallinn: 'Estonia', lithuania: 'Lithuania', vilnius: 'Lithuania',
  romania: 'Romania', bucharest: 'Romania', greece: 'Greece', athens: 'Greece', belgium: 'Belgium', brussels: 'Belgium',
  'united states': 'United States', usa: 'United States', 'new york': 'United States', 'san francisco': 'United States', seattle: 'United States', boston: 'United States', austin: 'United States', chicago: 'United States',
  canada: 'Canada', toronto: 'Canada', india: 'India', bengaluru: 'India', bangalore: 'India', singapore: 'Singapore', japan: 'Japan', tokyo: 'Japan', australia: 'Australia', sydney: 'Australia',
};
const CITY = new Set(Object.keys(COUNTRY).filter((k) => !/^(austria|österreich|germany|deutschland|switzerland|netherlands|united kingdom|uk|ireland|france|spain|portugal|italy|poland|czechia|czech republic|hungary|sweden|denmark|norway|finland|estonia|lithuania|romania|greece|belgium|united states|usa|canada|india|singapore|japan|australia)$/.test(k)));
const cap = (s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

function placeTags(locs) {
  const countries = {}, cities = {};
  let remote = 0;
  for (const l of locs) {
    const low = String(l || '').toLowerCase();
    if (/remote|anywhere|worldwide/.test(low)) remote++;
    for (const [k, country] of Object.entries(COUNTRY)) {
      if (new RegExp(`(^|[^\\p{L}])${k}([^\\p{L}]|$)`, 'u').test(low)) {
        countries[country] = (countries[country] || 0) + 1;
        if (CITY.has(k)) cities[cap(k === 'wien' ? 'vienna' : k === 'münchen' ? 'munich' : k)] = (cities[cap(k === 'wien' ? 'vienna' : k === 'münchen' ? 'munich' : k)] || 0) + 1;
      }
    }
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  return { countries: top(countries, 6), cities: top(cities, 8), remoteShare: locs.length ? Math.round((remote / locs.length) * 100) / 100 : 0 };
}

async function get(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
  return { ok: r.ok, status: r.status, text: await r.text() };
}

async function check(ats, slug) {
  switch (ats) {
    case 'greenhouse': { const r = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`); const j = r.ok ? JSON.parse(r.text) : {}; return (j.jobs || []).map((x) => x.location?.name); }
    case 'lever': { const r = await get(`https://api.lever.co/v0/postings/${slug}?mode=json`); const j = r.ok ? JSON.parse(r.text) : []; return Array.isArray(j) ? j.map((x) => x.categories?.location) : []; }
    case 'ashby': { const r = await get(`https://api.ashbyhq.com/posting-api/job-board/${slug}`); const j = r.ok ? JSON.parse(r.text) : {}; return (j.jobs || []).map((x) => `${x.location || ''}${x.isRemote ? ' remote' : ''}`); }
    case 'workable': { const r = await get(`https://apply.workable.com/api/v1/widget/accounts/${slug}`); const j = r.ok ? JSON.parse(r.text) : {}; return (j.jobs || []).map((x) => [x.city, x.country, x.telecommuting ? 'remote' : ''].filter(Boolean).join(', ')); }
    case 'personio': { const r = await get(`https://${slug}.jobs.personio.de/xml`); return r.ok ? [...r.text.matchAll(/<office>([^<]*)<\/office>/g)].map((m) => m[1]) : []; }
    case 'recruitee': { const r = await get(`https://${slug}.recruitee.com/api/offers/`); const j = r.ok ? JSON.parse(r.text) : {}; return (j.offers || []).map((x) => `${x.location || ''} ${x.country || ''}${x.remote ? ' remote' : ''}`); }
    case 'smartrecruiters': { const r = await get(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`); const j = r.ok ? JSON.parse(r.text) : {}; return (j.content || []).map((x) => `${x.location?.city || ''}, ${x.location?.country || ''}${x.location?.remote ? ' remote' : ''}`); }
    case 'teamtailor': { const r = await get(`https://${slug}.teamtailor.com/jobs.rss`); return r.ok ? [...r.text.matchAll(/<item>[\s\S]*?<\/item>/g)].map((m) => (m[0].match(/<tt:city>([^<]*)/) || m[0].match(/<category>([^<]*)/) || [, ''])[1]) : []; }
    case 'bamboohr': { const r = await get(`https://${slug}.bamboohr.com/careers/list`); if (!r.ok || !r.text.startsWith('{')) return []; const j = JSON.parse(r.text); return (j.result || []).map((x) => `${x.location?.city || ''}, ${x.location?.state || ''} ${x.isRemote ? 'remote' : ''}`); }
    case 'workday': {
      const [tenant, wd, site] = slug.split(':');
      const r = await get(`https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 20, offset: 0, searchText: '', appliedFacets: {} }) });
      const j = r.ok ? JSON.parse(r.text) : {}; return (j.jobPostings || []).map((x) => x.locationsText);
    }
  }
  return [];
}

const out = [];
const queue = [...C];
async function worker() {
  while (queue.length) {
    const [name, ats, slug, industry, tags] = queue.shift();
    try {
      const locs = await check(ats, slug);
      const n = locs.length;
      console.log(n > 0 ? 'OK ' : '-- ', ats.padEnd(15), slug.padEnd(40), n);
      if (n > 0) out.push({ name, ats, slug, industry, tags: tags.split(',').filter(Boolean), jobs: n, ...placeTags(locs) });
    } catch (e) { console.log('ERR', ats, slug, e.message.slice(0, 60)); }
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
out.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync('lib/companies/seed.json', JSON.stringify({ verifiedAt: new Date().toISOString().slice(0, 10), companies: out }, null, 1));
console.log('kept', out.length, 'of', C.length);
