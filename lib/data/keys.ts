import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';
import { decryptApiKey, encryptApiKey } from '@/lib/crypto/encryption';

/** Optional per-user Gemini key, AES-256-GCM encrypted at rest. Never returned to the browser. */

export async function getGeminiKey(userId: string): Promise<string | null> {
  if (isDemoMode()) return null;
  const row = await getPrisma().apiKey.findFirst({
    where: { userId, provider: 'gemini', isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  try {
    return decryptApiKey(row.encryptedKey, row.iv, row.authTag);
  } catch {
    return null;
  }
}

export async function geminiKeyInfo(userId: string) {
  if (isDemoMode()) return null;
  const row = await getPrisma().apiKey.findFirst({
    where: { userId, provider: 'gemini', isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, encryptedKey: true },
  });
  return row ? { addedAt: row.createdAt.toISOString() } : null;
}

export async function saveGeminiKey(userId: string, key: string) {
  const prisma = getPrisma();
  await prisma.apiKey.updateMany({ where: { userId, provider: 'gemini' }, data: { isActive: false } });
  await prisma.apiKey.create({ data: { userId, provider: 'gemini', ...encryptApiKey(key), isActive: true } });
}

export async function deleteGeminiKey(userId: string) {
  await getPrisma().apiKey.updateMany({ where: { userId, provider: 'gemini' }, data: { isActive: false } });
}

/** Checks a key without spending generation quota (models.list is free). */
export async function checkGeminiKey(key: string): Promise<boolean> {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
    headers: { 'x-goog-api-key': key },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return Boolean(res?.ok);
}
