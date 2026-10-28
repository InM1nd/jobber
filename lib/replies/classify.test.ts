import { describe, expect, it } from 'vitest';
import { nextActionFor, noteLine, readReply, statusFor } from './classify';
import { replyMessage } from '@/lib/telegram/bot';

const apps = [
  { id: 'a1', company: 'Acme GmbH', role: 'Frontend Engineer', status: 'applied' },
  { id: 'a2', company: 'Bitpanda', role: 'Senior Frontend Engineer', status: 'applied' },
  { id: 'a3', company: 'Bitpanda', role: 'Product Designer', status: 'to_apply' },
];

describe('employer replies', () => {
  it('code decides the status change', () => {
    expect(statusFor('rejection', 'applied')).toBe('rejected');
    expect(statusFor('interview', 'applied')).toBe('interview');
    expect(statusFor('interview', 'offer')).toBeNull();
    expect(statusFor('acknowledgement', 'to_apply')).toBe('applied');
    expect(statusFor('acknowledgement', 'interview')).toBeNull();
    expect(statusFor('other', 'applied')).toBeNull();
  });

  it('trusts the model’s application id only when the company agrees, else matches in code', () => {
    expect(readReply({ kind: 'interview', company: 'Acme', applicationId: 'a1' }, apps).applicationId).toBe('a1');
    expect(readReply({ kind: 'interview', company: 'Acme', applicationId: 'a2' }, apps).applicationId).toBe('a1');
    expect(readReply({ kind: 'rejection', company: 'Bitpanda', role: 'Product Designer', applicationId: 'zzz' }, apps).applicationId).toBe('a3');
    expect(readReply({ kind: 'rejection', company: 'Bitpanda' }, apps).applicationId).toBeNull(); // two Bitpanda roles: ambiguous
    expect(readReply({ kind: 'nonsense' }, apps).kind).toBe('other');
  });

  it('keeps an interview time only for interviews and only when it parses', () => {
    expect(readReply({ kind: 'interview', interviewAt: '2026-11-04T14:00:00+01:00' }, apps).interviewAt).toBe('2026-11-04T14:00:00+01:00');
    expect(readReply({ kind: 'interview', interviewAt: 'next Tuesday' }, apps).interviewAt).toBeNull();
    expect(readReply({ kind: 'question', interviewAt: '2026-11-04T14:00:00+01:00' }, apps).interviewAt).toBeNull();
  });

  it('writes the note, next action and bot message', () => {
    const r = { kind: 'interview' as const, summary: 'Invites you to a call.', questions: ['Notice period?'], interviewAt: null, company: 'Acme', role: null, applicationId: 'a1', draft: 'Hi,\n\nThanks!', unverified: ['Monday'] };
    expect(noteLine(r, new Date('2026-10-28T10:00:00Z'))).toBe('[2026-10-28] Interview invite: Invites you to a call.');
    expect(nextActionFor(r)).toBe('Reply with times for the interview');
    const msg = replyMessage({ reading: r, application: { id: 'a1', company: 'Acme GmbH', role: 'Frontend Engineer' }, previousStatus: 'applied', newStatus: 'interview' });
    expect(msg).toContain('Tracker: Applied → Interview');
    expect(msg).toContain('Check before sending: Monday');
  });
});
