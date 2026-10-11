import { connection } from 'next/server';
import { isDemoMode } from '@/lib/demo/mode';
import { requireUser, type SessionUser } from '@/lib/data/service';
import { AuthGate, BottomNav, Sidebar } from '@/components/telegram-ui';

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
    <div className="flex min-h-screen bg-bg text-fg">
      <Sidebar account={accountLabel(user)} />
      <div className="min-w-0 flex-1">
        {demo && (
          <div className="border-b border-line px-4 py-1.5 text-center text-[11px] text-subtle">
            Demo mode · sample data
          </div>
        )}
        <main className="mx-auto max-w-lg animate-in pb-[calc(112px+var(--safe-bottom))] pt-[calc(20px+var(--safe-top))] px-5 md:max-w-2xl md:px-10 md:pb-16 md:pt-14">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
