import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { isDemoMode } from '@/lib/demo/mode';
import { requireUser } from '@/lib/data/service';

export const instant = false;

const navItems = [
  { href: '/dashboard/matches', label: 'Matches' },
  { href: '/dashboard/tracker', label: 'Tracker' },
  { href: '/dashboard/profile', label: 'Profile' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await requireUser();
  if (!user) redirect('/auth/signin');
  const demo = isDemoMode();

  return (
    <div className="min-h-screen bg-white text-gray-950">
      <header className="border-b border-gray-200">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link href="/dashboard/matches" className="text-xl font-semibold tracking-tight text-green-700">
            Jobber
          </Link>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-gray-950">
                {item.label}
              </Link>
            ))}
          </nav>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
      </header>
      {demo && (
        <p className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
          Demo mode. These are sample matches so you can click through. Connect Supabase and set DEMO_MODE=false for your real account.
        </p>
      )}
      <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
    </div>
  );
}
