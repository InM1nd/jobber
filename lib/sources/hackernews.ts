import axios from 'axios';
import { stripHtml } from './html';
import type { JobSource, JobSourceConfig, RawJob } from './types';

/**
 * Hacker News "Ask HN: Who is hiring?": the monthly thread where companies (mostly startups)
 * post open roles, often with an address to apply to. Read through HN's public Algolia API.
 * One source row per keyword; the thread itself is fetched once and cached per instance.
 * Where each post is (city / remote) is parsed from its header; the normal pre-filter then
 * keeps only what the user can take. Idea from AienTech/dossier (startups/hn), written for Jobber.
 */

const SEARCH_URL = 'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10';
const itemUrl = (id: string | number) => `https://hn.algolia.com/api/v1/items/${id}`;
const hnLink = (id: string | number) => `https://news.ycombinator.com/item?id=${id}`;
const UA = { 'user-agent': 'Jobber/1.0 (+https://jobber-kohl.vercel.app)' };
const CACHE_MS = 6 * 60 * 60 * 1000;
/** Posts older than this are from an earlier thread or stale. */
const MAX_POSTS = 800;

const ROLE = /\b(engineer|developer|programmer|architect|designer|scientist|manager|lead|head of|founding|sre|devops|intern|analyst|researcher|marketer|writer|specialist|consultant)\b/i;
const MODE = /\b(remote|on-?site|onsite|hybrid|in[-\s]office|relocation)\b/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export interface HnPost {
  id: number | string;
  text?: string | null;
  created_at?: string | null;
}

/** "Acme (YC W24) | Senior Frontend Engineer | Vienna, Austria | Hybrid | €70k" → its parts. */
export function headerParts(text: string): string[] {
  const first = text.split('\n').find((l) => l.trim()) || '';
  return first.split(/\s*[|•]\s*|\s+[–—]\s+/).map((p) => p.trim()).filter(Boolean);
}

/** One "Who is hiring?" post as jobs: one per role named in its header, or one "Open roles" entry. */
export function jobsFromHnPost(post: HnPost): RawJob[] {
  if (!post.text) return [];
  const text = stripHtml(post.text.replace(/<p>/gi, '\n\n'));
  const parts = headerParts(text);
  if (parts.length < 2) return []; // not a job post (questions, replies)
  const company = (parts[0] || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s*\(.*?\)\s*$/, '')
    .replace(/^\W+|\W+$/g, '')
    .trim()
    .slice(0, 100);
  if (company.length < 2) return [];
  const rest = parts.slice(1);
  const roles = rest.filter((p) => ROLE.test(p) && p.length < 120).flatMap((p) => p.split(/\s*(?:,|;| and | & |\/)\s*(?=[A-Z])/)).map((r) => r.trim()).filter((r) => ROLE.test(r)).slice(0, 5);
  const modes = rest.filter((p) => MODE.test(p));
  const places = rest.filter((p) => !ROLE.test(p) && !/\d+\s*k|\$|€|£|equity|salary|full[-\s]?time|part[-\s]?time|contract|visa/i.test(p) && /^[A-Z][\p{L} .,'()/-]+$/u.test(p) && p.length < 80);
  const remote = modes.some((m) => /remote/i.test(m)) || places.some((p) => /remote/i.test(p));
  const location = [...new Set([...places, ...modes])].join(' · ').slice(0, 200) || (remote ? 'Remote' : '');
  const emails = [...new Set(text.match(EMAIL) || [])].slice(0, 3);
  const description = `${text.slice(0, 15_000)}${emails.length ? `\n\nApply by email: ${emails.join(', ')} (as written in the post)` : ''}\n\nPosted in Hacker News “Who is hiring?”.`;
  const base = {
    company,
    location: location || undefined,
    remote,
    description,
    url: hnLink(post.id),
    postedAt: post.created_at ? new Date(post.created_at) : undefined,
  };
  if (!roles.length) return [{ ...base, externalId: `hn:${post.id}`, title: 'Open roles' }];
  return roles.map((title, i) => ({ ...base, externalId: `hn:${post.id}:${i}`, title: title.slice(0, 120) }));
}

/** Keeps the posts that mention the keyword (as a word, in the header or text). */
export function matchesKeyword(job: RawJob, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return true;
  const words = k.split(/\s+/).filter((w) => w.length > 1);
  const hay = `${job.title}\n${job.description}`.toLowerCase();
  return words.every((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(hay));
}

/** The newest "Who is hiring?" thread id from an Algolia search reply. */
export function latestHiringThread(data: unknown): string | null {
  const hits = (data as { hits?: Array<{ objectID?: string; title?: string; created_at?: string }> })?.hits;
  if (!Array.isArray(hits)) return null;
  const thread = hits
    .filter((h) => h?.objectID && /who is hiring/i.test(h.title || ''))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  return thread?.objectID || null;
}

export function jobsFromThread(thread: unknown): RawJob[] {
  const children = (thread as { children?: HnPost[] })?.children;
  if (!Array.isArray(children)) return [];
  return children.slice(0, MAX_POSTS).flatMap((c) => jobsFromHnPost(c));
}

const g = globalThis as unknown as { hnThread?: { at: number; jobs: RawJob[] } };

async function threadJobs(): Promise<RawJob[]> {
  if (g.hnThread && Date.now() - g.hnThread.at < CACHE_MS) return g.hnThread.jobs;
  const search = await axios.get(SEARCH_URL, { timeout: 15_000, headers: UA });
  const id = latestHiringThread(search.data);
  if (!id) return [];
  const thread = await axios.get(itemUrl(id), { timeout: 30_000, headers: UA, maxContentLength: 30_000_000 });
  const jobs = jobsFromThread(thread.data);
  g.hnThread = { at: Date.now(), jobs };
  return jobs;
}

export function hackerNewsSourceUrl(keyword: string) {
  return `https://news.ycombinator.com/jobs-thread#q=${encodeURIComponent(keyword.trim().toLowerCase())}`;
}

export class HackerNewsSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const q = new URLSearchParams(this.config.sourceUrl.split('#')[1] || '').get('q') || '';
    return (await threadJobs()).filter((j) => matchesKeyword(j, q));
  }
}
