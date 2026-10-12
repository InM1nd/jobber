#!/usr/bin/env node
// One-time import of the Google Sheet tracker export into Jobber via the Agent API.
// Usage: AGENT_API_KEY=$(cat /workspace/.jobber_agent_api_key) node scripts/import-sheet.mjs [--dry-run] [--base https://jobber-check.vercel.app] [--dir /workspace/jobber_import]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DRY = args.includes('--dry-run');
const BASE = opt('--base', 'https://jobber-check.vercel.app').replace(/\/$/, '');
const BATCH = Number(opt('--batch', '10'));
const DIR = opt('--dir', '/workspace/jobber_import');
const KEY = process.env.AGENT_API_KEY;
if (!DRY && !KEY) { console.error('AGENT_API_KEY env is required'); process.exit(1); }

const RU_MONTHS = { 'янв': 1, 'февр': 2, 'фев': 2, 'мар': 3, 'апр': 4, 'мая': 5, 'май': 5, 'июн': 6, 'июл': 7, 'авг': 8, 'сент': 9, 'сен': 9, 'окт': 10, 'нояб': 11, 'ноя': 11, 'дек': 12 };
const unmapped = [];
function date(v, row, field) {
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = v.toLowerCase().match(/^(\d{1,2})\s+([а-я]+)\.?\s+(\d{4})/);
  if (m && RU_MONTHS[m[2]]) return `${m[3]}-${String(RU_MONTHS[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  unmapped.push({ row, field, value: v });
  return null;
}
const STATUSES = new Set(['to apply', 'check listing', 'applied', 'on hold', 'rejected', 'skip']);

const apps = JSON.parse(readFileSync(`${DIR}/applications.json`, 'utf8'));
const reviews = JSON.parse(readFileSync(`${DIR}/company_reviews.json`, 'utf8'));
const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9а-я]+/g, ' ').trim();
const reviewFor = (company) => reviews.find((r) => norm(r.company) === norm(company) || norm(r.company).startsWith(norm(company) + ' ') || norm(company).startsWith(norm(r.company) + ' '));

const items = apps.map((a) => {
  if (!STATUSES.has(a.status.toLowerCase())) unmapped.push({ row: a.sheetRow, field: 'status', value: a.status });
  if (a.priority && !/^(high|medium|low)$/i.test(a.priority)) unmapped.push({ row: a.sheetRow, field: 'priority', value: a.priority });
  const rv = reviewFor(a.company);
  return {
    company: a.company,
    role: a.role,
    location: a.location || undefined,
    url: /^https?:\/\//.test(a.link) ? a.link : undefined,
    source: 'sheet-import',
    priority: a.priority || undefined,
    whyFit: a.match || undefined,
    risks: rv ? `Company review ${rv.rating}: ${rv.summary}. ${rv.facts}\n${rv.sources.join('\n')}` : undefined,
    status: a.status,
    appliedAt: date(a.dateApplied, a.sheetRow, 'Date applied'),
    followUpAt: date(a.followUpDate, a.sheetRow, 'Follow-up date'),
    nextAction: a.nextAction || undefined,
    notes: a.notes || undefined,
  };
});
const matched = new Set(apps.map((a) => reviewFor(a.company)?.company).filter(Boolean));
const orphanReviews = reviews.filter((r) => !matched.has(r.company));

console.log(`applications: ${items.length}, reviews: ${reviews.length} (attached to apps: ${matched.size}, no matching app: ${orphanReviews.length})`);
if (orphanReviews.length) console.log('reviews without app (left for watchlist):', orphanReviews.map((r) => r.company).join('; '));
if (unmapped.length) console.log('UNMAPPED values:', JSON.stringify(unmapped, null, 1));
if (DRY) { console.log('dry run, sample:', JSON.stringify(items[0], null, 1)); process.exit(unmapped.length ? 2 : 0); }

let created = 0, updated = 0; const errors = [];
for (let i = 0; i < items.length; i += BATCH) {
  const res = await fetch(`${BASE}/api/agent/applications`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ items: items.slice(i, i + BATCH) }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`batch ${i}: HTTP ${res.status}`, j); process.exit(1); }
  created += j.created; updated += j.updated;
  errors.push(...j.errors.map((e) => ({ ...e, sheetRow: apps[i + e.index].sheetRow })));
}
console.log(`done: created ${created}, updated ${updated}, errors ${errors.length}`, errors.length ? errors : '');
