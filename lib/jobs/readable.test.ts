import { describe, expect, it } from 'vitest';
import { readableJob, salaryFromText } from './readable';

const runOn = "About CircuitHub CircuitHub is reshaping electronics manufacturing. We've raised $45M and we're already profitable. What you'll do Shape the customer experience. Make internal tools a pleasure. What we're looking for • 4+ years with TypeScript and React • An eye for design • Comfortable owning features end to end Pay UK £80k–£125k · US $125k–$250k, plus equity. We've raised $45M and we're already profitable. Find more English Speaking Jobs in Germany on Arbeitnow";

describe('readableJob', () => {
  it('splits a run-on ad into ordered sections without repeats or board footers', () => {
    const s = readableJob(runOn);
    expect(s.map((x) => x.kind)).toEqual(['task', 'req', 'offer', 'about']);
    expect(s[1].items).toEqual(['4+ years with TypeScript and React', 'An eye for design', 'Comfortable owning features end to end']);
    expect(s[2].items[0]).toMatch(/^UK £80k/);
    const all = s.flatMap((x) => x.items).join(' ');
    expect(all.match(/raised \$45M/g)?.length).toBe(1);
    expect(all).not.toMatch(/Arbeitnow/);
  });

  it('keeps real headings and drops equal-opportunity boilerplate', () => {
    const s = readableJob('Your tasks:\n- Build the app\n- Ship weekly\n\nYour profile:\n- React\n\nEqual opportunity\nWe welcome everyone.');
    expect(s.map((x) => x.title)).toEqual(['What you’d do', 'What they’re looking for']);
    expect(s[0].items).toEqual(['Build the app', 'Ship weekly']);
  });

  it('labels an ad without headings as a plain description', () => {
    const s = readableJob('We build tools. You will write React.');
    expect(s).toHaveLength(1);
    expect(s[0].title).toBe('Description');
  });
});

describe('salaryFromText', () => {
  it('takes the first range in the text', () => {
    expect(salaryFromText(runOn)).toEqual({ min: 80000, max: 125000, currency: 'GBP' });
    expect(salaryFromText('Gehalt €55.000 – €65.000 brutto')).toEqual({ min: 55000, max: 65000, currency: 'EUR' });
    expect(salaryFromText('raised $45M')).toEqual({});
  });
});
