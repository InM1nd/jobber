import crypto from 'crypto';

function secret(): string {
  const value = process.env.ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string');
  }
  return value;
}

export function seal(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function open<T>(token: string): T | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let expected: string;
  try {
    expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  } catch {
    return null;
  }
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
