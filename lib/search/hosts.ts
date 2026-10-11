const HOST_CONCURRENCY = 8;

/** Same host → fetched one after another (polite); different hosts → in parallel. */
export function hostKey(s: { sourceType: string; sourceUrl: string }) {
  if (s.sourceType.startsWith('scrape:')) return s.sourceType;
  try {
    return new URL(s.sourceUrl).host;
  } catch {
    return s.sourceType;
  }
}

/** Runs `work` per item: items sharing a key run serially, keys run in parallel (bounded). Stops starting new items after the deadline. */
export async function fetchByHost<T>(items: T[], key: (t: T) => string, work: (t: T) => Promise<unknown>, deadline: number, concurrency = HOST_CONCURRENCY) {
  const groups = new Map<string, T[]>();
  for (const it of items) groups.set(key(it), [...(groups.get(key(it)) || []), it]);
  const queues = [...groups.values()];
  const done: T[] = [];
  let next = 0;
  async function lane() {
    while (next < queues.length) {
      const q = queues[next++];
      for (const it of q) {
        if (Date.now() > deadline) return;
        await work(it).catch(() => 0);
        done.push(it);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queues.length) }, lane));
  return done;
}

