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

export const LITE_MODEL = () => process.env.GEMINI_MODEL_LITE || 'gemini-3.5-flash-lite';
export const FLASH_MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.5-flash';

/**
 * Flash-lite does everything by default (free tier: 15 RPM / 500 RPD per project).
 * Flash (5 RPM / 20 RPD) is only an optional fallback for "smart" work when
 * GEMINI_FLASH_FALLBACK=true, so the scarce daily Flash budget is never the default.
 */
export function modelsFor(tier: GeminiTier): string[] {
  const lite = LITE_MODEL();
  if (tier === 'smart' && process.env.GEMINI_FLASH_FALLBACK === 'true') return [...new Set([lite, FLASH_MODEL()])];
  return [lite];
}

/** Requests per minute we allow ourselves per model (free tier: flash 5, flash-lite higher). */
function rpm(model: string) {
  const lite = model.includes('lite');
  const fromEnv = Number(lite ? process.env.GEMINI_RPM_LITE : process.env.GEMINI_RPM_SMART);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return lite ? 15 : 5;
}

const g = globalThis as unknown as { geminiLimiters?: Map<string, SlidingWindowLimiter> };
/** One limiter per (key, model): the shared key and each user's own key have separate quotas. */
function limiter(model: string, keyId: string) {
  g.geminiLimiters ??= new Map();
  const id = `${keyId}:${model}`;
  let l = g.geminiLimiters.get(id);
  if (!l) {
    l = new SlidingWindowLimiter(rpm(model));
    g.geminiLimiters.set(id, l);
  }
  return l;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Shared key pool: GEMINI_API_KEYS (comma-separated) plus GEMINI_API_KEY, deduped. Order is stable (budget ids depend on it). */
export function sharedKeys(): string[] {
  const list = [process.env.GEMINI_API_KEY, ...(process.env.GEMINI_API_KEYS || '').split(/[,\s]+/)].map((k) => k?.trim()).filter((k): k is string => Boolean(k));
  return [...new Set(list)];
}

export function hasSharedAi() {
  return sharedKeys().length > 0;
}

const pool = globalThis as unknown as { geminiNextKey?: number };

export interface GeminiOptions {
  tier: GeminiTier;
  system?: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** A user's own key; defaults to the shared GEMINI_API_KEY. */
  apiKey?: string;
  /** Called once per HTTP request actually sent (for budget accounting). keyIndex = index in the shared pool. */
  onRequest?: (model: string, keyIndex: number) => void | Promise<void>;
  /** Longest we are willing to wait for the limiter / a retry, in ms. */
  maxWaitMs?: number;
  timeoutMs?: number;
}

/**
 * Runs on the user's own key, or on the shared pool: starts at a rotating key and falls
 * through to the next key when one is rate-limited (429), out of its daily budget, or busy.
 */
export async function gemini(prompt: string, opts: GeminiOptions): Promise<string> {
  if (opts.apiKey) return geminiOne(prompt, opts, opts.apiKey, `u${opts.apiKey.slice(-6)}`, -1);
  const keys = sharedKeys();
  if (!keys.length) throw new AiUnavailableError('GEMINI_API_KEY is not set');
  const start = (pool.geminiNextKey = ((pool.geminiNextKey ?? -1) + 1) % keys.length);
  let last: unknown;
  for (let i = 0; i < keys.length; i++) {
    const idx = (start + i) % keys.length;
    try {
      return await geminiOne(prompt, opts, keys[idx], idx === 0 ? 'shared' : `shared${idx}`, idx);
    } catch (error) {
      last = error;
      const name = error instanceof Error ? error.name : '';
      if (name !== 'AiUnavailableError' && name !== 'BudgetExhaustedError') throw error;
    }
  }
  throw last;
}

async function geminiOne(prompt: string, opts: GeminiOptions, key: string, keyId: string, keyIndex: number): Promise<string> {
  const maxWait = opts.maxWaitMs ?? 20_000;
  let lastError: unknown;

  for (const model of modelsFor(opts.tier)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const lim = limiter(model, keyId);
      const wait = lim.waitTime();
      if (wait > maxWait) {
        lastError = new AiUnavailableError(`Rate limited on ${model}`, wait);
        break;
      }
      if (wait > 0) await sleep(wait);
      lim.record();
      await opts.onRequest?.(model, keyIndex);

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
    // Models sometimes leave trailing commas.
    return JSON.parse(match[0].replace(/,\s*([\]}])/g, '$1'));
  }
}
