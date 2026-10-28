import { describe, expect, it } from 'vitest';
import { atsRef, parseGreenhouseQuestions, parseRecruiteeQuestions, parseWorkableForm } from './questions';
import { mergeAnswers } from './drafts';
import { parseDrafts } from './format';

describe('application form questions', () => {
  it('greenhouse: drops identity/file fields, keeps cover letter + custom questions', () => {
    const q = parseGreenhouseQuestions({ questions: [
      { label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text' }] },
      { label: 'Resume/CV', required: true, fields: [{ name: 'resume', type: 'input_file' }, { name: 'resume_text', type: 'textarea' }] },
      { label: 'Cover Letter', required: false, fields: [{ name: 'cover_letter', type: 'input_file' }, { name: 'cover_letter_text', type: 'textarea' }] },
      { label: 'Do you need a visa?', required: true, fields: [{ name: 'question_1', type: 'multi_value_single_select', values: [{ label: 'Yes' }, { label: 'No' }] }] },
      { label: 'Salary expectations?', required: true, fields: [{ name: 'question_2', type: 'input_text' }] },
    ] });
    expect(q.map((x) => [x.id, x.kind])).toEqual([['cover_letter_text', 'text'], ['question_1', 'boolean'], ['question_2', 'text']]);
  });
  it('recruitee + workable', () => {
    expect(parseRecruiteeQuestions({ open_questions: [{ id: 5, body: 'German level?', kind: 'single_choice', required: true, open_question_options: [{ body: 'A2' }] }] })[0]).toMatchObject({ id: '5', kind: 'choice', options: ['A2'] });
    const w = parseWorkableForm([{ fields: [{ id: 'email', label: 'Email', type: 'email' }, { id: 'resume', label: 'Resume', type: 'file' }, { id: 'QA_1', label: 'Why us?', type: 'paragraph', required: true }] }]);
    expect(w).toEqual([{ id: 'QA_1', label: 'Why us?', kind: 'text', required: true }]);
  });
  it('atsRef reads urls and sources', () => {
    expect(atsRef({ url: 'https://job-boards.eu.greenhouse.io/bitpanda/jobs/123' })).toMatchObject({ ats: 'greenhouse', board: 'bitpanda', id: '123' });
    expect(atsRef({ url: 'https://apply.workable.com/modash/j/CD50BEE8FE/' })).toMatchObject({ ats: 'workable', id: 'CD50BEE8FE' });
    expect(atsRef({ url: 'https://nyrahealth.recruitee.com/o/frontend-dev' })).toMatchObject({ ats: 'recruitee', company: 'nyrahealth', slug: 'frontend-dev' });
    expect(atsRef({ url: 'https://jobs.ashbyhq.com/linear/abc' })).toBeNull();
  });
  it('merges answers, cleans bold and brand casing; parses saved drafts', () => {
    const items = mergeAnswers([{ id: 'a', label: 'Why {company}?', kind: 'text', required: false }], { answers: [{ id: 'a', answer: '**Because** of Marswalk Media.' }] }, 'Acme');
    expect(items[0]).toMatchObject({ label: 'Why Acme?', answer: 'Because of marswalk media.' });
    expect(parseDrafts('Old letter')!.items[0].answer).toBe('Old letter');
    expect(parseDrafts(JSON.stringify({ v: 1, source: "standard", generatedAt: "x", items }))!.items).toHaveLength(1);
  });
});

import { clean, draftsPrompt, guardDrafts } from './drafts';
describe('clean', () => {
  it('puts the sign-off on its own lines, with the profile name', () => {
    expect(clean('…start on 1 November 2026. Best,\nOleksandr', 'Oleksandr')).toBe('…start on 1 November 2026.\n\nBest,\nOleksandr');
    expect(clean('…soon. Best regards, Anna', 'Anna')).toBe('…soon.\n\nBest,\nAnna');
  });
});

describe('drafts for any user', () => {
  const base = { company: 'Acme', role: 'Frontend Engineer', description: 'React app for logistics.', cvText: 'Anna Berg. React developer in Berlin since 2020.', writingRules: null, notes: null, questions: [] };
  it('uses the profile facts and name, never the owner’s', () => {
    const p = draftsPrompt({ ...base, facts: '- Available from 1 March\nNo visa needed in Germany', fullName: 'Anna Berg' });
    expect(p).toContain('- Available from 1 March');
    expect(p).toContain('Anna');
    expect(p).not.toMatch(/Oleksandr|Vienna|RWR|60,000/);
  });
  it('asks for [fill in] when there are no facts', () => {
    expect(draftsPrompt({ ...base, facts: null, fullName: null })).toContain('[fill in: …]');
  });
  it('flags unbacked claims in text answers only', () => {
    const items = guardDrafts([
      { id: 'a', label: 'Why Acme?', kind: 'text', required: false, answer: 'I built React apps at Zalando for 5 years.' },
      { id: 'b', label: 'Visa?', kind: 'boolean', required: false, options: ['Yes', 'No'], answer: 'No' },
    ], { ...base, facts: null, fullName: 'Anna Berg' });
    expect(items[0].unverified).toEqual(['Zalando', '5']);
    expect(items[1].unverified).toBeUndefined();
  });
});
