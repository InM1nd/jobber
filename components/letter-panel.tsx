'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { haptic } from '@/components/telegram-ui';

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
      haptic('error');
      return;
    }
    setLetter(body.letter || '');
    haptic('success');
  }


  async function copy() {
    await navigator.clipboard.writeText(letter);
    setCopied(true);
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <p className="text-[14px] font-medium">Cover letter</p>
        <div className="flex gap-1.5">
          {letter && (
            <Button type="button" size="sm" variant="ghost" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
          <Button type="button" size="sm" variant={letter ? 'outline' : 'default'} onClick={generate} disabled={loading}>
            {loading ? 'Writing…' : letter ? 'Rewrite' : 'Generate'}
          </Button>
        </div>
      </div>
      {error && <p className="px-4 pt-3 text-[13px] text-danger">{error}</p>}
      {letter ? (
        <div className="whitespace-pre-wrap px-4 py-4 text-[14px] leading-[1.65]">{letter}</div>
      ) : (
        <p className="px-4 py-6 text-center text-[13px] text-muted">No letter yet. It follows your writing rules and uses your own AI key.</p>
      )}
    </section>
  );
}
