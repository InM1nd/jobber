'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function LetterPanel({ matchId, initial }: { matchId: string; initial: string | null }) {
  const [letter, setLetter] = useState(initial || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError('');
    const response = await fetch(`/api/matches/${matchId}/letter`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(body.error || 'Could not generate a letter');
      return;
    }
    setLetter(body.letter || '');
  }

  async function copy() {
    await navigator.clipboard.writeText(letter);
    setCopied(true);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={generate} disabled={loading}>
          {loading ? 'Writing…' : 'Generate letter'}
        </Button>
        {letter && (
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {letter ? (
        <pre className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm leading-6">{letter}</pre>
      ) : (
        <p className="text-sm text-gray-600">No letter yet. Generating one uses your own API key.</p>
      )}
    </section>
  );
}
