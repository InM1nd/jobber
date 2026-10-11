import { SettingsPanel } from '@/components/settings-panel';
import { PageHeader } from '@/components/ui/kit';
import { isOwner, linkedAccounts, listApiKeys, requireUser } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';
import { seal } from '@/lib/auth/signed';

export const instant = false;

function emailLinkToken(userId: string) {
  try {
    return seal({ uid: userId, purpose: 'link-email', exp: Date.now() + 60 * 60 * 1000 });
  } catch {
    return null;
  }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const user = await requireUser();
  if (!user) return null;
  const [keys, query, owner] = await Promise.all([
    listApiKeys(user.id),
    searchParams,
    isDemoMode() ? Promise.resolve(true) : isOwner(user),
  ]);
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, '') || 'JobberCheck_bot';

  return (
    <div>
      <PageHeader title="Settings" />
      <SettingsPanel
        keys={keys}
        accounts={linkedAccounts(user)}
        emailLinkToken={emailLinkToken(user.id)}
        botUsername={bot}
        isOwner={owner}
        notice={query.connected ? `${query.connected} connected.` : undefined}
        error={query.error}
      />
    </div>
  );
}
