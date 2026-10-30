import { TrackerBoard } from '@/components/tracker-board';
import { FunnelCard } from '@/components/funnel-card';
import { PageHeader } from '@/components/ui/kit';
import { getApplications, getProfile, requireUser } from '@/lib/data/service';

export const instant = false;

export default async function TrackerPage() {
  const user = await requireUser();
  if (!user) return null;
  const [applications, profile] = await Promise.all([getApplications(user.id), getProfile(user.id)]);
  return (
    <div data-wide>
      <PageHeader title="Tracker" subtitle={`${applications.length} application${applications.length === 1 ? '' : 's'}`} />
      <FunnelCard applications={applications} quietDays={profile.quietDays ?? 14} />
      <TrackerBoard applications={applications} />
    </div>
  );
}
