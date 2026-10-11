import { NextResponse } from 'next/server';
import { deleteApiKey, requireUser, saveApiKey } from '@/lib/data/service';

export const instant = false;

const PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'xai']);

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  const provider = String(data.provider || '');
  const apiKey = String(data.apiKey || '').trim();
  if (!PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  }
  if (apiKey.length < 8) {
    return NextResponse.json({ error: 'API key looks too short' }, { status: 400 });
  }

  try {
    const saved = await saveApiKey(user.id, provider, apiKey);
    return NextResponse.json({ key: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not store the key';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  await deleteApiKey(user.id, id);
  return NextResponse.json({ ok: true });
}
