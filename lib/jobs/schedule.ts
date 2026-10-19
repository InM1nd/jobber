import type { JobSource } from '@prisma/client';

export const isSlow = (s: Pick<JobSource, 'sourceType'>) => s.sourceType === 'scrape:stepstone';
export const timeoutFor = (s: Pick<JobSource, 'sourceType'>) => (isSlow(s) ? 47_000 : s.sourceType.startsWith('scrape:') ? 30_000 : 20_000);

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

/** Orders due sources: never-fetched first, then oldest; slow StepStone ones go to the front so they get the most time. */
export function planRun<T extends Pick<JobSource, 'sourceType' | 'lastFetchedAt'>>(sources: T[]): T[] {
  const age = (s: T) => (s.lastFetchedAt ? new Date(s.lastFetchedAt).getTime() : 0);
  const sorted = [...sources].sort((a, b) => age(a) - age(b));
  // At most one StepStone page per run (same host, polite delay); the rest wait for the next run.
  const slow = sorted.filter(isSlow).slice(0, 1);
  return [...slow, ...sorted.filter((s) => !isSlow(s))];
}

