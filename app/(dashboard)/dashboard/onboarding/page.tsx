import { Onboarding } from '@/components/onboarding';
import { getProfile, requireUser } from '@/lib/data/service';

export const instant = false;

export default async function OnboardingPage() {
  const user = await requireUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  return <Onboarding firstName={profile.fullName?.split(' ')[0] || null} />;
}
