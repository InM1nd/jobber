import { SettingsPanel } from '@/components/settings-panel';
import { PageHeader } from '@/components/ui/kit';
import { isOwner, linkedAccounts, requireUser } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';
import { usageSummary } from '@/lib/ai/quota';
import { geminiKeyInfo } from '@/lib/data/keys';
import { budgetLeft, sharedUsageToday } from '@/lib/ai/budget';
import { LITE_MODEL } from '@/lib/ai/gemini';
import { jsearchKeyFor, jsearchKeyInfo, jsearchUsage } from '@/lib/sources/jsearch';
import { connection } from 'next/server';

export const instant = false;

// Query notices (?connected, ?error) are read on the client so this page has
// no searchParams dependency and can be prefetched like the other tabs.
export default async function SettingsPage() {
  // Per-request page (usage counters use today's date), like the other tabs.
  await connection();
  const user = await requireUser();
  if (!user) return null;
  const geminiKey = await geminiKeyInfo(user.id);
  const [usage, owner, shared, jsearch] = await Promise.all([
    usageSummary(user.id, Boolean(geminiKey)),
    isDemoMode() ? Promise.resolve(true) : isOwner(user),
    sharedUsageToday(),
    isDemoMode()
      ? Promise.resolve({ key: null, active: false, fromEnv: false, usage: { used: 0, limit: 180 } })
      : Promise.all([jsearchKeyInfo(user.id), jsearchKeyFor(user.id), jsearchUsage(user.id)]).then(([key, creds, use]) => ({ key, active: Boolean(creds), fromEnv: Boolean(creds && !creds.own), usage: use })),
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
        jsearch={jsearch}
      />
    </div>
  );
}
