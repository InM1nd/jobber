import { SettingsPanel } from '@/components/settings-panel';
import { listApiKeys, requireUser } from '@/lib/data/service';

export const instant = false;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const user = await requireUser();
  if (!user) return null;
  const keys = await listApiKeys(user.id);
  const query = await searchParams;
  const notice = query.connected
    ? `${query.connected} connected.`
    : query.error || undefined;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-gray-600">Keys, Telegram, and invites.</p>
      </div>
      <SettingsPanel
        keys={keys}
        telegramId={user.telegramId}
        telegramUsername={user.telegramUsername}
        notice={notice}
      />
    </div>
  );
}
