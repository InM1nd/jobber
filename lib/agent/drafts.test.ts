import { describe, expect, it } from 'vitest';
import { draftsMessage, pickForDrafts } from './drafts';

describe('agent drafts', () => {
  const rows = [
    { id: 'a', score: 78, title: 'Frontend Engineer', company: 'Acme' },
    { id: 'b', score: 91, title: 'Product Engineer', company: 'Storyblok' },
    { id: 'c', score: 84, title: 'Design Engineer', company: 'Linear' },
  ];
  it('drafts the best matches first, up to the daily limit', () => {
    expect(pickForDrafts(rows, 2).map((r) => r.id)).toEqual(['b', 'c']);
  });
  it('tells the user what is waiting and that nothing was sent', () => {
    const msg = draftsMessage(pickForDrafts(rows, 2), 'https://jobber.example');
    expect(msg).toContain('2 cover letters are ready for review');
    expect(msg).toContain('https://jobber.example/dashboard/matches/b');
    expect(msg).toContain('Nothing was sent');
  });
});
