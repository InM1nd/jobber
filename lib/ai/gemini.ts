import { SlidingWindowLimiter, backoffDelay, parseRetryDelay } from './limiter';

/**
 * Server-side Gemini client on the owner's key (GEMINI_API_KEY).
 * - "smart" model for CV parsing, letters and CV advice; "lite" for bulk scoring.
 * - In-process sliding-window limiter per model + a shared backoff after 429s.
 * - Falls back to the next model when one is overloaded (503) or retired (404).
 */

export type GeminiTier = 'smart' | 'lite';

export class AiUnavailableError extends Error {
  constructor(message: string, public retryAfterMs?: number, public fromServer = false) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

function models(tier: GeminiTier): string[] {
  const smart = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const lite = process.env.GEMINI_MODEL_LITE || 'gemini-3.5-flash-lite';
  // Bulk scoring never spills onto the scarce smart model (free tier: ~5 RPM).
  return tier === 'smart' ? [...new Set([smart, lite])] : [lite];
}

/** Requests per minute we allow ourselves per model (free tier: flash 5, flash-lite higher). */
function rpm(model: string) {
  const lite = model.includes('lite');
  const fromEnv = Number(lite ? process.env.GEMINI_RPM_LITE : process.env.GEMINI_RPM_SMART);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return lite ? 15 : 5;
}

const g = globalThis as unknown as { geminiLimiters?: Map<string, SlidingWindowLimiter> };
function limiter(model: string) {
  g.geminiLimiters ??= new Map();
  let l = g.geminiLimiters.get(model);
  if (!l) {
    l = new SlidingWindowLimiter(rpm(model));
    g.geminiLimiters.set(model, l);
  }
  return l;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function hasSharedAi() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export interface GeminiOptions {
  tier: GeminiTier;
  system?: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Longest we are willing to wait for the limiter / a retry, in ms. */
  maxWaitMs?: number;
  timeoutMs?: number;
}

export async function gemini(prompt: string, opts: GeminiOptions): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiUnavailableError('GEMINI_API_KEY is not set');
  const maxWait = opts.maxWaitMs ?? 20_000;
  let lastError: unknown;

  for (const model of models(opts.tier)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const lim = limiter(model);
      const wait = lim.waitTime();
      if (wait > maxWait) {
        lastError = new AiUnavailableError(`Rate limited on ${model}`, wait);
        break;
      }
      if (wait > 0) await sleep(wait);
      lim.record();

      let res: Response;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
            body: JSON.stringify({
              ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: opts.temperature ?? 0.3,
                maxOutputTokens: opts.maxTokens ?? 2048,
                ...(opts.json ? { responseMimeType: 'application/json' } : {}),
              },
            }),
          },
        );
      } catch (error) {
        lastError = error; // timeout / network: try the next model
        break;
      }

      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
        };
        const text = (data.candidates?.[0]?.content?.parts || [])
          .filter((p) => !p.thought)
          .map((p) => p.text || '')
          .join('')
          .trim();
        if (text) return text;
        lastError = new Error(`Empty response from ${model}`);
        break;
      }

      const body = await res.json().catch(() => null);
      if (res.status === 429) {
        const retry = parseRetryDelay(body);
        const delay = backoffDelay(attempt, retry);
        lim.backoff(delay);
        lastError = new AiUnavailableError(`Gemini quota hit on ${model}`, delay, true);
        if (delay > maxWait) break; // daily/long limit: try next model, else give up
        continue;
      }
      if (res.status === 503 || res.status === 500) {
        lastError = new AiUnavailableError(`${model} overloaded`, 5_000);
        if (attempt === 0) {
          await sleep(1500);
          continue;
        }
        break;
      }
      if (res.status === 404) {
        lastError = new Error(`${model} not available`);
        break;
      }
      throw new Error(`Gemini ${res.status}: ${JSON.stringify(body)?.slice(0, 300)}`);
    }
  }
  if (lastError instanceof AiUnavailableError) throw lastError;
  throw new AiUnavailableError(lastError instanceof Error ? lastError.message : 'Gemini unavailable');
}

/** Extracts the first JSON object/array from a model reply. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/[\[{][\s\S]*[\]}]/);
    if (!match) throw new Error('No JSON in model reply');
    return JSON.parse(match[0]);
  }
}
