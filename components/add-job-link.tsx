'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Loader2, Plus } from 'lucide-react';
import { haptic } from '@/components/telegram-ui';

/** "Add job by link": paste any job URL (or the text if the site blocks us); we read it once and score it. */
export function AddJobLink() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [needText, setNeedText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/jobs/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(needText ? { url, text } : { url }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: 'Network error' };
    setBusy(false);
    if (res?.ok) {
      haptic('success');
      if (data.matchId) router.push(`/dashboard/matches/${data.matchId}`);
      else setError(data.scoreError ? `Saved “${data.title}”, but scoring failed: ${data.scoreError}` : `Saved “${data.title}”.`);
      return;
    }
    haptic('error');
    if (data.code === 'need_text') setNeedText(true);
    setError(data.error || 'Something went wrong');
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mb-6 flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line px-5 py-3.5 text-left transition-colors hover:border-accent">
        <Plus className="size-4 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Add a job by link</span>
          <span className="block text-[12.5px] text-muted">Found something on willhaben, LinkedIn or anywhere? Paste the link — we’ll score it.</span>
        </span>
      </button>
    );

  return (
    <div className="mb-6 rounded-[var(--radius-card)] border border-line px-5 py-4">
      <p className="mb-3 flex items-center gap-2 text-[15px] font-medium"><Link2 className="size-4 text-accent" /> Add a job by link</p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        inputMode="url"
        className="w-full rounded-[10px] border border-line bg-transparent px-3.5 py-2.5 text-[15px] outline-none focus:border-accent"
      />
      {needText && (
        <>
          <p className="mt-3 text-[13px] text-muted">That site doesn’t let us read the page. Open it, copy the whole job text and paste it here:</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder="Job title, company, what they ask for…"
            className="mt-2 w-full rounded-[10px] border border-line bg-transparent px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
          />
        </>
      )}
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || (needText ? text.trim().length < 80 : !url.trim())}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[14px] font-semibold text-accent-fg disabled:opacity-40"
        >
          {busy && <Loader2 className="size-4 animate-spin" />} {busy ? 'Reading the job…' : needText ? 'Use this text' : 'Add & score'}
        </button>
        {!needText && (
          <button type="button" onClick={() => setNeedText(true)} className="px-2 text-[13px] text-muted hover:text-fg">Paste text instead</button>
        )}
        <button type="button" onClick={() => { setOpen(false); setNeedText(false); setError(null); }} className="ml-auto px-2 text-[13px] text-muted hover:text-fg">Cancel</button>
      </div>
    </div>
  );
}
