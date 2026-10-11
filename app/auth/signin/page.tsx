'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail } from 'lucide-react';
import { createClient } from '@/lib/db/supabase';
import { Button } from '@/components/ui/button';
import { Logo, Notice, fieldClass } from '@/components/ui/kit';
import { TelegramLoginButton } from '@/components/telegram-login-button';

const BOT = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'JobberCheck_bot').replace(/^@/, '');

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setLoading(false);
      if (error) setError(error.message);
      else setMessage(`Check ${email} for a sign-in link.`);
    } catch {
      setLoading(false);
      setError('Email sign-in is not configured here.');
    }
  };

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
          <h1 className="text-center text-[26px] font-semibold tracking-[-0.02em]">Welcome back</h1>
          <p className="mt-1.5 text-center text-sm text-muted">Same account as the Jobber app in Telegram.</p>

          <div className="mt-8 rounded-[20px] border border-line bg-surface p-6 shadow-lift">
            <TelegramLoginButton bot={BOT} onDone={() => router.push('/dashboard/matches')} onError={setError} />
            <div className="my-5 flex items-center gap-3 text-[12px] text-subtle">
              <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
            </div>
            <form onSubmit={handleSignIn} className="space-y-3">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className={fieldClass}
              />
              <Button type="submit" variant="outline" disabled={loading} className="w-full">
                <Mail /> {loading ? 'Sending…' : 'Email me a link'}
              </Button>
            </form>
            {(message || error) && (
              <div className="mt-4">
                {message && <Notice tone="success">{message}</Notice>}
                {error && <Notice tone="danger">{error}</Notice>}
              </div>
            )}
          </div>
          <p className="mt-6 text-center text-[13px] text-muted">
            New here? <Link href="/auth/signup" className="font-medium text-accent hover:underline">Join with an invite</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
