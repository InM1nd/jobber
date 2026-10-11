import { NextResponse } from 'next/server';
import { readOpenRouterState } from '@/lib/auth/openrouter';
import { saveApiKey } from '@/lib/data/service';

export const instant = false;

function page(title: string, body: string) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 48px 20px; background: #fff; color: #171717; }
    main { max-width: 28rem; margin: 0 auto; }
    h1 { font-size: 1.4rem; }
    p { line-height: 1.5; color: #3f3f46; }
  </style>
</head>
<body><main><h1>${title}</h1><p>${body}</p></main></body>
</html>`;
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = readOpenRouterState(url.searchParams.get('state'));
  if (!code || !state) {
    return page('Could not connect OpenRouter', 'The return link was missing a code. Go back to Jobber in Telegram and paste a key instead.');
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: state.verifier,
        code_challenge_method: 'S256',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const apiKey = String(payload.key || payload.api_key || payload.data?.key || '');
    if (!response.ok || apiKey.length < 8) {
      return page('OpenRouter did not return a key', 'Go back to the Jobber chat and paste a key in Settings.');
    }
    await saveApiKey(state.uid, 'openrouter', apiKey);
    return page(
      'OpenRouter is connected',
      'The key is saved. Switch back to Telegram and open Jobber again. Settings will show OpenRouter.',
    );
  } catch {
    return page('Could not store the key', 'Go back to Telegram and paste a key in Settings.');
  }
}
