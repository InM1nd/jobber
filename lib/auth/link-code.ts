import crypto from 'crypto';

/**
 * Stateless one-time-ish link code for t.me/<bot>?start=link_<code>.
 * Telegram start params allow 64 chars of [A-Za-z0-9_-], so the code packs
 * a 16-byte user uuid, a 4-byte expiry and a 10-byte HMAC into 40 base64url chars.
 */
const TTL_SECONDS = 15 * 60;

function key(secret?: string) {
  const value = secret ?? process.env.ENCRYPTION_KEY ?? '';
  if (!value) throw new Error('ENCRYPTION_KEY is not set');
  return value;
}

function uuidToBytes(uuid: string): Buffer | null {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return Buffer.from(hex, 'hex');
}

function bytesToUuid(buf: Buffer): string {
  const h = buf.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function createLinkCode(userId: string, nowMs = Date.now(), secret?: string): string {
  const id = uuidToBytes(userId);
  if (!id) throw new Error('User id is not a uuid');
  const exp = Buffer.alloc(4);
  exp.writeUInt32BE(Math.floor(nowMs / 1000) + TTL_SECONDS);
  const body = Buffer.concat([id, exp]);
  const mac = crypto.createHmac('sha256', key(secret)).update('link:').update(body).digest().subarray(0, 10);
  return Buffer.concat([body, mac]).toString('base64url');
}

export function readLinkCode(code: string, nowMs = Date.now(), secret?: string): string | null {
  let raw: Buffer;
  try {
    raw = Buffer.from(code, 'base64url');
  } catch {
    return null;
  }
  if (raw.length !== 30) return null;
  const body = raw.subarray(0, 20);
  const mac = raw.subarray(20);
  const expected = crypto.createHmac('sha256', key(secret)).update('link:').update(body).digest().subarray(0, 10);
  if (!crypto.timingSafeEqual(mac, expected)) return null;
  if (body.readUInt32BE(16) < Math.floor(nowMs / 1000)) return null;
  return bytesToUuid(body.subarray(0, 16));
}
