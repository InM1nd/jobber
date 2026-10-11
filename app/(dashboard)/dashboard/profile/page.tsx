import { ProfileEditor } from '@/components/profile-editor';
import { getProfile, requireUser } from '@/lib/data/service';

export const instant = false;

export default async function ProfilePage() {
  const user = await requireUser();
  if (!user) return null;
  const profile = await getProfile(user.id);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="max-w-2xl text-gray-600">
          The matcher and the letter writer only see what you put here. Seed your own CV and rules from a local file before sharing the app.
        </p>
      </div>
      <ProfileEditor profile={profile} />
    </div>
  );
}
