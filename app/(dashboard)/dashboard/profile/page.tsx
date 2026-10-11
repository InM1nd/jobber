import { ProfileEditor } from '@/components/profile-editor';
import { PageHeader } from '@/components/ui/kit';
import { getProfile, requireUser } from '@/lib/data/service';

export const instant = false;

export default async function ProfilePage() {
  const user = await requireUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  return (
    <div>
      <PageHeader title="Profile" subtitle="The matcher and the letter writer only see what’s here." />
      <ProfileEditor profile={profile} />
    </div>
  );
}
