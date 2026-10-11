import type { ChatClient } from '@/lib/llm/matcher';
import type { GeminiTier } from './gemini';
import type { AiKind } from './limiter';
import { runAi } from './run';

/** Adapts runAi (user key or shared key, with quotas) to the ChatClient interface. */
export function userChatClient(userId: string, kind: AiKind, tier: GeminiTier = 'smart', maxWaitMs?: number): ChatClient {
  return {
    async chat(messages, options) {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const prompt = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n\n');
      const content = await runAi(userId, kind, prompt, {
        tier,
        system: system || undefined,
        temperature: options?.temperature,
        maxTokens: Math.max(options?.maxTokens ?? 1500, 1500),
        maxWaitMs,
      });
      return { content };
    },
  };
}
