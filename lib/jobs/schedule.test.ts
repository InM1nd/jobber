import { describe, expect, it } from 'vitest';
import { planRun } from './schedule';

describe('planRun', () => {
  it('puts never-fetched first, oldest next, one StepStone at the front', () => {
    const s = (id: string, t: string, at: string | null) => ({ id, sourceType: t, lastFetchedAt: at ? new Date(at) : null });
    const out = planRun([
      s('a', 'greenhouse', '2026-10-10'),
      s('b', 'ashby', null),
      s('st1', 'scrape:stepstone', '2026-10-12'),
      s('st2', 'scrape:stepstone', '2026-10-11'),
      s('c', 'join', '2026-10-01'),
    ]);
    expect(out.map((x) => x.id)).toEqual(['st2', 'b', 'c', 'a']);
  });
});
