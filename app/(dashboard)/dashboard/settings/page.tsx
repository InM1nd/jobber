import { SettingsPanel } from '@/components/settings-panel';
import { PageHeader } from '@/components/ui/kit';
import { isOwner, linkedAccounts, requireUser } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';
import { usageSummary } from '@/lib/ai/quota';
import { geminiKeyInfo } from '@/lib/data/keys';
import { budgetLeft, sharedUsageToday } from '@/lib/ai/budget';
import { LITE_MODEL } from '@/lib/ai/gemini';

export const instant = false;

// Query notices (?connected, ?error) are read on the client so this page has
// no searchParams dependency and can be prefetched like the other tabs.
export default async function SettingsPage() {
  const user = await requireUser();
  if (!user) return null;
  const geminiKey = await geminiKeyInfo(user.id);
  const [usage, owner, shared] = await Promise.all([
    usageSummary(user.id, Boolean(geminiKey)),
    isDemoMode() ? Promise.resolve(true) : isOwner(user),
    sharedUsageToday(),
  ]);
  const lite = shared.find((s) => s.model === LITE_MODEL());
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, '') || 'JobberCheck_bot';

  return (
    <div>
      <PageHeader title="Settings" />
      <SettingsPanel
        usage={usage}
        geminiKey={geminiKey}
        shared={{ left: budgetLeft(lite?.used ?? 0, LITE_MODEL(), false) }}
        accounts={linkedAccounts(user)}
        botUsername={bot}
        isOwner={owner}
        demo={isDemoMode()}
      />
    </div>
  );
}
