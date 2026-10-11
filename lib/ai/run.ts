import { gemini, type GeminiOptions } from './gemini';
import { takeShared } from './budget';
import { addUsage, assertQuota } from './quota';
import type { AiKind } from './limiter';
import { getGeminiKey } from '@/lib/data/keys';

/**
 * The one entry point for AI work done for a user.
 * - Uses the user's own Gemini key when they added one (their quota, bigger limits).
 * - Otherwise the shared key: per-user daily limits + the project-wide daily budget.
 */
export async function runAi(
  userId: string,
  kind: AiKind,
  prompt: string,
  opts: Omit<GeminiOptions, 'apiKey' | 'onRequest'> & { onboarding?: boolean },
) {
  const own = await getGeminiKey(userId);
  await assertQuota(userId, kind, Boolean(own));
  const { onboarding, ...rest } = opts;
  const text = await gemini(prompt, {
    ...rest,
    apiKey: own || undefined,
    onRequest: own ? undefined : (model) => takeShared(model, Boolean(onboarding)),
  });
  await addUsage(userId, kind, 1);
  return text;
}
