import { connection } from 'next/server';
import { isDemoMode } from '@/lib/demo/mode';
import { getProfile, requireUser, type SessionUser } from '@/lib/data/service';
import { countDeck } from '@/lib/tracker/deck';
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
  // Cards waiting in Review, for the nav badge. A failed count only hides the badge.
  const reviewCount = await getProfile(user.id)
    .then((p) => countDeck(user.id, p.minScore ?? 0))
    .catch(() => 0);

  return (
    <div className="flex min-h-screen bg-bg text-fg">
      <Sidebar account={accountLabel(user)} reviewCount={reviewCount} />
      <div className="min-w-0 flex-1">
        {demo && (
          <div className="border-b border-line px-4 py-1.5 text-center text-[12px] text-subtle">
            Demo mode · sample data
          </div>
        )}
        <main className="mx-auto max-w-lg animate-in pb-[calc(104px+var(--safe-bottom))] pt-[calc(20px+var(--safe-top))] px-5 md:max-w-2xl md:px-10 md:pb-16 md:pt-14 lg:has-[[data-wide]]:max-w-[1500px] lg:has-[[data-wide]]:px-8 lg:has-[[data-wide]]:pt-8">
          {children}
        </main>
      </div>
      <BottomNav reviewCount={reviewCount} />
    </div>
  );
}
