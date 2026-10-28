import { describe, expect, it } from 'vitest';
import { refineChips, replaceParagraph, splitLetter } from './letter';
import { isStale, parseAiMeta, PROMPT_VERSIONS, stamp, withNewLetter } from '@/lib/ai/meta';
import { validateAdvice } from '@/lib/ai/cv-advice';

const letter = 'Hi Anna,\n\nFirst paragraph about Acme.\n\nSecond one with a story.\n\nThird: Vienna, from March.\n\nBest,\nOleksandr';

describe('letter paragraphs', () => {
  it('splits body from sign-off and keeps the greeting with the first paragraph', () => {
    const { paragraphs, signOff } = splitLetter(letter);
    expect(paragraphs).toEqual(['Hi Anna,\n\nFirst paragraph about Acme.', 'Second one with a story.', 'Third: Vienna, from March.']);
    expect(signOff).toBe('Best,\nOleksandr');
  });

  it('replaces one paragraph and leaves the rest word for word', () => {
    const out = replaceParagraph(letter, 1, 'Paragraph 2: A sharper story.\n\nBest,\nOleksandr');
    expect(out).toBe('Hi Anna,\n\nFirst paragraph about Acme.\n\nA sharper story.\n\nThird: Vienna, from March.\n\nBest,\nOleksandr');
    expect(replaceParagraph(letter, 0, 'New opening.')).toContain('Hi Anna,\n\nNew opening.');
    expect(replaceParagraph(letter, 9, 'x')).toBe(letter);
  });

  it('builds refine chips from the match', () => {
    const chips = refineChips([
      { text: 'React', must: true, skill: 'React', result: 'covered', note: '' },
      { text: 'German C1', must: true, skill: null, result: 'gap', note: '' },
    ], 'Acme');
    expect(chips.slice(0, 3)).toEqual(['Lead with React', 'Address “German C1” honestly', 'More specific about Acme']);
  });
});

describe('ai meta', () => {
  it('keeps the replaced letter as a version, labelled with how it was made', () => {
    let meta = withNewLetter({}, null, stamp('letter', [], { cause: 'generated' }));
    expect(meta.letterHistory).toBeUndefined();
    meta = withNewLetter(meta, 'Old letter', stamp('letter', ['Google'], { cause: 'paragraph', detail: 'paragraph 2' }));
    expect(meta.letterHistory?.[0]).toMatchObject({ text: 'Old letter', cause: 'generated' });
    expect(meta.letter?.unverified).toEqual(['Google']);
    expect(parseAiMeta(JSON.parse(JSON.stringify(meta)))).toEqual(meta);
  });

  it('marks outputs from older prompts as stale', () => {
    expect(isStale('letter', { v: 'letter@1', at: '' }, true)).toBe(true);
    expect(isStale('letter', undefined, true)).toBe(true);
    expect(isStale('letter', { v: PROMPT_VERSIONS.letter, at: '' }, true)).toBe(false);
    expect(isStale('letter', undefined, false)).toBe(false);
  });
});

describe('advice validation', () => {
  it('drops made-up quotes and keywords the CV has, adds code-found gaps', () => {
    const cv = 'Built a React component library. Led the Next.js migration.';
    const out = validateAdvice({
      verdict: 'ok', emphasize: [], add: [],
      reword: [{ from: 'Built a React component library', to: 'Built a design system in React' }, { from: 'Managed a team of 10', to: 'x' }],
      missingKeywords: ['React', 'Storybook'],
      doNotClaim: ['GraphQL'],
    }, cv, ['graphql', 'German C1']);
    expect(out.reword).toHaveLength(1);
    expect(out.missingKeywords).toEqual(['Storybook']);
    expect(out.doNotClaim).toEqual(['GraphQL', 'German C1']);
  });
});
