import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireUser, saveApiKey } from '@/lib/data/service';

export const instant = false;

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const settings = new URL('/dashboard/settings', appUrl);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const cookieStore = await cookies();
  const verifier = cookieStore.get('or_verifier')?.value;
  cookieStore.delete('or_verifier');

  if (!code || !verifier) {
    settings.searchParams.set('error', 'OpenRouter did not return a code');
    return NextResponse.redirect(settings);
  }

  const user = await requireUser();
  if (!user) {
    return NextResponse.redirect(new URL('/auth/signin', appUrl));
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: 'S256',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const apiKey = String(payload.key || payload.api_key || payload.data?.key || '');
    if (!response.ok || apiKey.length < 8) {
      settings.searchParams.set('error', 'OpenRouter key exchange failed');
      return NextResponse.redirect(settings);
    }
    await saveApiKey(user.id, 'openrouter', apiKey);
    settings.searchParams.set('connected', 'openrouter');
    return NextResponse.redirect(settings);
  } catch {
    settings.searchParams.set('error', 'Could not store the OpenRouter key');
    return NextResponse.redirect(settings);
  }
}
