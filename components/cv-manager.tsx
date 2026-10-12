'use client';

import { useRef, useState } from 'react';
import { FileText, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, fieldClass } from '@/components/ui/kit';
import { haptic } from '@/components/telegram-ui';
import { cn } from '@/lib/utils';
import type { CvProfile } from '@/lib/ai/cv-profile';

export interface CvItem {
  id: string;
  label: string;
  fileName: string | null;
  characters?: number;
  parsed?: CvProfile | null;
}

/** Upload / label / remove CVs. Each upload is read by AI once (prefills the form). */
export function CvManager({ cvs, onChange, onParsed, compact }: { cvs: CvItem[]; onChange: (cvs: CvItem[]) => void; onParsed?: (p: CvProfile) => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(body: FormData | string) {
    if (typeof body !== 'string') {
      const f = body.get('file');
      if (f instanceof File && f.size > 4 * 1024 * 1024) {
        setError('PDF must be under 4 MB — export a lighter PDF or paste the text.');
        return;
      }
    }
    setBusy(true);
    setError('');
    const res = await fetch('/api/cvs', {
      method: 'POST',
      ...(typeof body === 'string' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: body }) } : { body }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      setError(data.error || (res?.status === 413 ? 'File too large — under 4 MB please.' : res?.status === 504 ? 'Reading took too long. Try again or paste the text.' : `Could not read the CV (error ${res?.status ?? 'network'}). Try again or paste the text.`));
      haptic('error');
      return;
    }
    haptic('success');
    setPaste(false);
    setText('');
    onChange([...cvs, { ...data.cv, parsed: data.parsed }]);
    onParsed?.(data.parsed);
  }

  async function rename(cv: CvItem, label: string) {
    setEditing(null);
    if (!label.trim() || label === cv.label) return;
    onChange(cvs.map((c) => (c.id === cv.id ? { ...c, label } : c)));
    await fetch(`/api/cvs/${cv.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }) });
  }

  async function remove(cv: CvItem) {
    onChange(cvs.filter((c) => c.id !== cv.id));
    await fetch(`/api/cvs/${cv.id}`, { method: 'DELETE' });
  }

  return (
    <div className="space-y-3">
      {error && <Notice tone="danger">{error}</Notice>}
      {cvs.length > 0 && (
        <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line">
          {cvs.map((cv) => (
            <div key={cv.id} className="flex items-center gap-3.5 px-4 py-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent"><FileText className="size-[18px]" /></span>
              <div className="min-w-0 flex-1">
                {editing === cv.id ? (
                  <input autoFocus defaultValue={cv.label} className={cn(fieldClass, 'py-1.5')} onBlur={(e) => rename(cv, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                ) : (
                  <button type="button" onClick={() => setEditing(cv.id)} className="flex max-w-full items-center gap-1.5 text-left">
                    <span className="truncate text-[15.5px] font-semibold tracking-[-0.01em]">{cv.label}</span>
                    <Pencil className="size-3 shrink-0 text-subtle" />
                  </button>
                )}
                <p className="truncate text-[12.5px] text-muted">{cv.fileName || 'Pasted text'}{cv.parsed?.targetRoles?.length ? ` · ${cv.parsed.targetRoles.slice(0, 2).join(', ')}` : ''}</p>
              </div>
              <button type="button" aria-label="Remove CV" onClick={() => remove(cv)} className="flex size-9 items-center justify-center rounded-full text-subtle hover:bg-surface-2 hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {busy ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line px-5 py-5">
          <Loader2 className="size-5 animate-spin text-accent" />
          <div>
            <p className="text-[15px] font-semibold">Reading your CV…</p>
            <p className="text-[12.5px] text-muted">About 10 seconds.</p>
          </div>
        </div>
      ) : paste ? (
        <div className="space-y-3">
          <textarea className={cn(fieldClass, 'min-h-[220px] resize-y leading-relaxed')} placeholder="Paste your CV here — experience, skills, languages, location…" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button className="flex-1" disabled={text.trim().length < 200} onClick={() => upload(text)}><FileText /> Read this CV</Button>
            <Button variant="ghost" onClick={() => setPaste(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) { const form = new FormData(); form.set('file', f); void upload(form); }
            }}
            className={cn(
              'flex w-full items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-line-strong text-left transition-colors hover:border-accent hover:bg-surface-2 active:scale-[0.99]',
              cvs.length || compact ? 'px-4 py-3.5' : 'flex-col px-6 py-12 text-center',
            )}
          >
            <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg', cvs.length || compact ? 'size-10' : 'size-12')}>
              {cvs.length ? <Plus className="size-5" /> : <Upload className="size-5" />}
            </span>
            <span>
              <span className="block text-[16px] font-semibold tracking-[-0.02em]">{cvs.length ? 'Add another CV' : 'Upload your CV (PDF)'}</span>
              <span className="block text-[13px] text-muted">{cvs.length ? 'e.g. a version for a different kind of role' : 'Tap to choose a file · up to 5 MB'}</span>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) { const form = new FormData(); form.set('file', f); void upload(form); }
            }}
          />
          <button type="button" onClick={() => setPaste(true)} className="w-full text-center text-[14px] text-accent">No PDF? Paste the text instead</button>
        </>
      )}
    </div>
  );
}
