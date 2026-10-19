import { JobSource, JobSourceConfig, RawJob } from './types';
import { looksRemote } from './html';

/**
 * JOIN (join.com) has no public jobs API; its public company page embeds the open
 * jobs as JSON (__NEXT_DATA__). We read that page only (5 jobs per page, max 4 pages).
 */
const UA = 'Mozilla/5.0 (compatible; JobberBot/1.0; personal job search, low volume)';

export function joinSlug(url: string): string | null {
  return url.match(/join\.com\/companies\/([\w-]+)/i)?.[1] || null;
}

export function parseJoinPage(html: string, slug: string): { jobs: RawJob[]; pageCount: number } {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { jobs: [], pageCount: 0 };
  const state = JSON.parse(m[1])?.props?.pageProps?.initialState || {};
  const items: any[] = state.jobs?.items || [];
  const jobs = items.map((j) => {
    const place = [j.city?.cityName, j.city?.countryName].filter(Boolean).join(', ');
    const remote = j.workplaceType === 'REMOTE' || looksRemote(place);
    const per = j.salaryFrequency === 'PER_MONTH' ? 14 : 1;
    const from = j.salaryAmountFrom?.amount, to = j.salaryAmountTo?.amount;
    const show = j.settings?.showSalary !== false;
    return {
      externalId: String(j.id),
      title: String(j.title || 'Untitled'),
      location: [place, j.workplaceType === 'HYBRID' ? 'Hybrid' : j.workplaceType === 'REMOTE' ? 'Remote' : ''].filter(Boolean).join(' · ') || undefined,
      remote,
      description: [j.title, j.category?.name, j.employmentType?.name, j.workplaceType].filter(Boolean).join(' · '),
      salaryMin: show && from ? Math.round((from / 100) * per) : undefined,
      salaryMax: show && to ? Math.round((to / 100) * per) : undefined,
      currency: show && from ? j.salaryAmountFrom?.currency : undefined,
      postedAt: j.createdAt ? new Date(j.createdAt) : undefined,
      url: `https://join.com/companies/${slug}/${j.idParam || j.id}`,
    } as RawJob;
  });
  return { jobs, pageCount: Number(state.jobs?.pagination?.pageCount || 1) };
}

export class JoinSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const slug = joinSlug(this.config.sourceUrl);
    if (!slug) throw new Error('Not a join.com company URL');
    const out: RawJob[] = [];
    for (let page = 1; page <= 4; page++) {
      const res = await fetch(`https://join.com/companies/${slug}${page > 1 ? `?page=${page}` : ''}`, {
        headers: { 'user-agent': UA, accept: 'text/html' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`JOIN ${slug}: HTTP ${res.status}`);
      const { jobs, pageCount } = parseJoinPage(await res.text(), slug);
      out.push(...jobs);
      if (page >= pageCount || !jobs.length) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return out;
  }
}
