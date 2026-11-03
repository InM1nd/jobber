import { ProfilePanel } from '@/components/profile-panel';
import { PageHeader } from '@/components/ui/kit';
import { getProfile, requireUser } from '@/lib/data/service';
import { draftFromProfile } from '@/lib/profile/draft';

export const instant = false;

export default async function ProfilePage() {
  const user = await requireUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  return (
    <div data-wide className="lg:max-w-[1040px]">
      <PageHeader title="Profile" subtitle="What Jobber searches and scores with. Changes apply to the next search." />
      <ProfilePanel initial={draftFromProfile(profile)} writingRules={profile.writingRules || ''} facts={profile.facts || ''} />
    </div>
  );
}
