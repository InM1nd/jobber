import { connection } from 'next/server';
import { getProfile, requireUser } from '@/lib/data/service';
import { getDeck } from '@/lib/tracker/deck';
import { ReviewDeck } from '@/components/review-deck';

export const instant = false;

/** Review: today's best undecided matches as a deck — apply, not for me, later. */
export default async function ReviewPage() {
  await connection();
  const user = await requireUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  const cards = await getDeck(user.id, profile.minScore ?? 0);
  return <ReviewDeck cards={cards} />;
}
