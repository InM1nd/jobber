import type { ChatClient } from '@/lib/llm/matcher';
import { gemini, type GeminiTier } from './gemini';

/** Adapts the shared Gemini client to the provider-agnostic ChatClient interface. */
export function sharedChatClient(tier: GeminiTier, maxWaitMs?: number): ChatClient {
  return {
    async chat(messages, options) {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const prompt = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n\n');
      const content = await gemini(prompt, {
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
