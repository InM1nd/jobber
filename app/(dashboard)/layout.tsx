import { connection } from 'next/server';
import { isDemoMode } from '@/lib/demo/mode';
import { requireUser, type SessionUser } from '@/lib/data/service';
import { AuthGate, BottomNav } from '@/components/telegram-ui';

export const instant = false;

function accountLabel(user: SessionUser) {
  if (user.telegramUsername) return `@${user.telegramUsername}`;
  if (user.email.endsWith('@users.jobber.local')) return 'Telegram';
  return user.email;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await requireUser();
  if (!user) return <AuthGate />;

  const demo = isDemoMode();

  return (
    <div className="min-h-screen bg-[var(--tg-bg,#fff)] text-[var(--tg-text,#171717)]">
      <header className="pt-[var(--tg-safe-top)]">
        <div className="mx-auto flex max-w-lg items-baseline justify-between px-4 py-3">
          <p className="text-lg font-semibold tracking-tight text-[var(--tg-link,#15803d)]">Jobber</p>
          <p className="truncate text-xs text-[var(--tg-hint,#6b7280)]">{accountLabel(user)}</p>
        </div>
      </header>
      {demo && (
        <p className="mx-auto max-w-lg px-4 pb-2 text-xs text-[var(--tg-hint,#92400e)]">
          Sample data. Open the bot to sign in with Telegram.
        </p>
      )}
      <main className="mx-auto max-w-lg px-4 pb-24 pt-2">{children}</main>
      <BottomNav />
    </div>
  );
}
