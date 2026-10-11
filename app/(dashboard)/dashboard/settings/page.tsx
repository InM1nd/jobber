import { SettingsPanel } from '@/components/settings-panel';
import { PageHeader } from '@/components/ui/kit';
import { isOwner, linkedAccounts, requireUser } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';
import { usageSummary } from '@/lib/ai/quota';

export const instant = false;

// Query notices (?connected, ?error) are read on the client so this page has
// no searchParams dependency and can be prefetched like the other tabs.
export default async function SettingsPage() {
  const user = await requireUser();
  if (!user) return null;
  const [usage, owner] = await Promise.all([
    usageSummary(user.id),
    isDemoMode() ? Promise.resolve(true) : isOwner(user),
  ]);
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, '') || 'JobberCheck_bot';

  return (
    <div>
      <PageHeader title="Settings" />
      <SettingsPanel
        usage={usage}
        accounts={linkedAccounts(user)}
        botUsername={bot}
        isOwner={owner}
        demo={isDemoMode()}
      />
    </div>
  );
}
