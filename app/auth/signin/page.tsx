'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Logo, Notice } from '@/components/ui/kit';
import { EmailLinkForm } from '@/components/email-link-form';
import { TelegramLoginButton } from '@/components/telegram-login-button';


export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  // ?preview=sent renders the sent state for screenshots.
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setPreview(q.get('preview') === 'sent');
    // Errors from /auth/callback (?error=) or straight from Supabase (#error_description=).
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const msg = q.get('error') || hash.get('error_description');
    if (msg) setError(msg === 'callback' ? 'The sign-in link did not work. Request a new one.' : msg);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-bg px-5">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between py-5">
        <Link href="/"><Logo /></Link>
        <Link href="/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Home
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center pb-20">
        <div className="w-full max-w-[380px] animate-in">
          <h1 className="text-center text-[30px] font-semibold tracking-[-0.04em]">Welcome back</h1>
          <p className="mt-1.5 text-center text-[15px] text-muted">Same account as the Jobber app in Telegram.</p>

          <div className="mt-8 rounded-[var(--radius-card)] border border-line p-6">
            <TelegramLoginButton onDone={() => router.push('/dashboard/matches')} onError={setError} />
            {error && <div className="mt-3"><Notice tone="danger">{error}</Notice></div>}
            <div className="my-5 flex items-center gap-3 text-[12px] text-subtle">
              <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
            </div>
            <EmailLinkForm
              key={preview ? 'preview' : 'live'}
              redirectTo="/auth/callback"
              initialState={preview ? { kind: 'sent', email: 'you@example.com', at: Date.now() - 20000 } : undefined}
            />
          </div>
          <p className="mt-6 text-center text-[13px] text-muted">
            New here? <Link href="/auth/signup" className="font-medium text-fg underline-offset-4 hover:underline">Join with an invite</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
