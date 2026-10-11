import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';
import { memoryStore, type LoginRow, type LoginStore } from './bot-login';

const g = globalThis as unknown as { demoLoginStore?: LoginStore };

/** Login requests live in CronJob rows (name "login:<sha256>", JSON in lastError). No migration. */
export function loginStore(): LoginStore {
  if (isDemoMode()) return (g.demoLoginStore ??= memoryStore());
  const prisma = getPrisma();
  return {
    async get(name) {
      const row = await prisma.cronJob.findUnique({ where: { name } });
      if (!row?.lastError) return null;
      try { return JSON.parse(row.lastError) as LoginRow; } catch { return null; }
    },
    async set(name, value) {
      // Opportunistic cleanup of old requests.
      await prisma.cronJob.deleteMany({ where: { name: { startsWith: 'login:' }, createdAt: { lt: new Date(Date.now() - 3600_000) } } });
      await prisma.cronJob.create({ data: { name, lastStatus: 'login', lastError: JSON.stringify(value) } });
    },
    async swap(name, expected, next) {
      const r = await prisma.cronJob.updateMany({ where: { name, lastError: JSON.stringify(expected) }, data: { lastError: JSON.stringify(next) } });
      return r.count === 1;
    },
  };
}
