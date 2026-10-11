'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { haptic, openExternal } from '@/components/telegram-ui';

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-600';

export function SettingsPanel({
  keys,
  telegramId,
  telegramUsername,
  notice,
}: {
  keys: { id: string; provider: string; createdAt: string }[];
  telegramId: string | null;
  telegramUsername: string | null;
  notice?: string;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [invite, setInvite] = useState('');
  const [message, setMessage] = useState(notice || '');
  const [error, setError] = useState('');

  async function saveKey(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    const response = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || 'Could not save the key');
      return;
    }
    setApiKey('');
    setMessage('Key stored. It is encrypted and is not shown again.');
    router.refresh();
  }

  async function removeKey(id: string) {
    await fetch(`/api/keys?id=${id}`, { method: 'DELETE' });
    router.refresh();
  }

  async function connectOpenRouter() {
    setError('');
    haptic('light');
    const response = await fetch('/api/auth/openrouter/start', { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.url) {
      setError(body.error || 'Could not start OpenRouter');
      haptic('error');
      return;
    }
    await openExternal(body.url);
  }

  async function makeInvite() {
    setError('');
    const response = await fetch('/api/invites', { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || 'Could not create an invite');
      return;
    }
    setInvite(body.code);
  }

  return (
    <div className="space-y-8">
      {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <section className="space-y-4 rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold">Your AI key</h2>
        <p className="text-sm text-gray-600">
          Jobber does not pay for model calls. OpenRouter is the primary connection. A pasted key is the fallback.
          Keys are encrypted with AES-256-GCM and never sent back to the browser.
        </p>
        <Button type="button" onClick={connectOpenRouter}>Connect OpenRouter</Button>
        <form onSubmit={saveKey} className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <select className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
            <option value="xai">xAI</option>
          </select>
          <input
            className={inputClass}
            type="password"
            autoComplete="off"
            placeholder="Paste API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button type="submit">Save key</Button>
        </form>
        {keys.length === 0 && <p className="text-sm text-gray-600">No key connected yet.</p>}
        {keys.map((key) => (
          <div key={key.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
            <span className="capitalize">{key.provider} · {new Date(key.createdAt).toLocaleDateString()}</span>
            <button type="button" className="text-gray-600 underline" onClick={() => removeKey(key.id)}>Remove</button>
          </div>
        ))}
      </section>

      <section className="space-y-2 rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold">Telegram</h2>
        <p className="text-sm text-gray-600">
          {telegramId
            ? `Signed in${telegramUsername ? ` as @${telegramUsername}` : ''}. Digests and follow-ups come to this chat.`
            : 'Open Jobber from Telegram to attach this account. Email sign-in still works in a normal browser.'}
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold">Invites</h2>
        <p className="text-sm text-gray-600">Create a code for someone you want to let in.</p>
        <Button type="button" variant="outline" onClick={makeInvite}>Create invite</Button>
        {invite && <p className="text-sm">Code: <code className="rounded bg-gray-100 px-2 py-1">{invite}</code></p>}
      </section>
    </div>
  );
}
