import { TrackerBoard } from '@/components/tracker-board';
import { PageHeader } from '@/components/ui/kit';
import { getApplications, requireUser } from '@/lib/data/service';

export const instant = false;

export default async function TrackerPage() {
  const user = await requireUser();
  if (!user) return null;
  const applications = await getApplications(user.id);
  return (
    <div>
      <PageHeader title="Tracker" subtitle={`${applications.length} application${applications.length === 1 ? '' : 's'}`} />
      <TrackerBoard applications={applications} />
    </div>
  );
}
