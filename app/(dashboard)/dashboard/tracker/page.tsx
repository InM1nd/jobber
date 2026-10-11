import { TrackerBoard } from '@/components/tracker-board';
import { getApplications, requireUser } from '@/lib/data/service';

export const instant = false;

export default async function TrackerPage() {
  const user = await requireUser();
  if (!user) return null;
  const applications = await getApplications(user.id);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Tracker</h1>
        <p className="text-gray-600">
          {applications.length} applications. Moving one to Applied sets a follow-up seven days later.
        </p>
      </div>
      <TrackerBoard applications={applications} />
    </div>
  );
}
