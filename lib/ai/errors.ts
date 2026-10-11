import { NextResponse } from 'next/server';
import { AiUnavailableError } from './gemini';
import { QuotaExceededError } from './quota';

/** Maps AI failures to friendly JSON responses; never leaks keys or raw bodies. */
export function aiErrorResponse(error: unknown) {
  if (error instanceof QuotaExceededError) {
    return NextResponse.json({ error: error.message, code: 'quota' }, { status: 429 });
  }
  if (error instanceof AiUnavailableError) {
    return NextResponse.json(
      { error: 'The shared AI is busy right now. Try again in a minute.', code: 'busy' },
      { status: 503 },
    );
  }
  console.error('AI call failed', error instanceof Error ? error.message.slice(0, 200) : error);
  return NextResponse.json({ error: 'AI request failed. Try again.', code: 'failed' }, { status: 502 });
}
