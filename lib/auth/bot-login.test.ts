import { beforeAll, describe, expect, it } from 'vitest';
import { confirmLogin, consumeLink, createLoginRequest, LOGIN_TTL_MS, loginInvite, memoryStore, pollLogin } from './bot-login';
import { seal } from './signed';

beforeAll(() => { process.env.ENCRYPTION_KEY = 'a'.repeat(64); });

describe('bot login', () => {
  it('confirms once and the link is single-use', async () => {
    const s = memoryStore();
    const t = await createLoginRequest(s, 'jobber-abc');
    expect(await loginInvite(s, t)).toEqual({ ok: true, invite: 'jobber-abc' });
    const c = await confirmLogin(s, t, 'u1');
    expect(c).not.toBeNull();
    expect(await confirmLogin(s, t, 'u2')).toBeNull();
    expect(await consumeLink(s, t, c!.sig)).toBe('u1');
    expect(await consumeLink(s, t, c!.sig)).toBeNull();
  });
  it('poll is pending, then done once', async () => {
    const s = memoryStore();
    const t = await createLoginRequest(s);
    expect((await pollLogin(s, t)).state).toBe('pending');
    await confirmLogin(s, t, 'u1');
    expect(await pollLogin(s, t)).toEqual({ state: 'done', uid: 'u1' });
    expect((await pollLogin(s, t)).state).toBe('expired');
  });
  it('expires after 5 minutes', async () => {
    const s = memoryStore();
    const now = Date.now();
    const t = await createLoginRequest(s, undefined, now);
    expect(await confirmLogin(s, t, 'u1', now + LOGIN_TTL_MS + 1)).toBeNull();
    expect((await pollLogin(s, t, now + LOGIN_TTL_MS + 1)).state).toBe('expired');
    const t2 = await createLoginRequest(s, undefined, now);
    const c = await confirmLogin(s, t2, 'u1', now);
    expect(await consumeLink(s, t2, c!.sig, now + LOGIN_TTL_MS + 1)).toBeNull();
  });
  it('rejects forged or mismatched signatures', async () => {
    const s = memoryStore();
    const t = await createLoginRequest(s);
    const c = await confirmLogin(s, t, 'u1');
    const other = await createLoginRequest(s);
    expect(await consumeLink(s, other, c!.sig)).toBeNull();
    expect(await consumeLink(s, t, c!.sig.slice(0, -2) + 'xx')).toBeNull();
    const [body] = c!.sig.split('.');
    const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), u: 'admin' })).toString('base64url');
    expect(await consumeLink(s, t, `${tampered}.${c!.sig.split('.')[1]}`)).toBeNull();
    expect(await consumeLink(s, t, seal({ p: 'other', u: 'u1', e: Date.now() + 1e5 }))).toBeNull();
    expect(await pollLogin(s, 'short')).toEqual({ state: 'expired' });
  });
});
