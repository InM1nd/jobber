'use client';

import { useEffect, useState } from 'react';
import { TelegramLoginButton } from '@/components/telegram-login-button';
import { createClient } from '@/lib/db/supabase';
import { Logo, Notice, fieldClass } from '@/components/ui/kit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  useEffect(() => { const c = new URLSearchParams(window.location.search).get('invite'); if (c) setInviteCode(c); }, []);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    const inviteResponse = await fetch('/api/invites/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inviteCode }),
    });
    if (!inviteResponse.ok) {
      const body = await inviteResponse.json().catch(() => ({}));
      setLoading(false);
      setError(body.error || 'Invite code is not valid');
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      setLoading(false);
      if (error) setError(error.message);
      else setMessage('Check your email for the magic link.');
    } catch {
      setLoading(false);
      setError('Supabase is not configured. Open the app from the home page to use demo mode.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg px-5">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between py-5">
        <Link href="/" className="inline-flex min-h-11 items-center"><Logo /></Link>
        <Link href="/" className="inline-flex min-h-11 items-center text-[13px] text-muted hover:text-fg">← Home</Link>
      </header>
      <main className="flex flex-1 items-center justify-center pb-20">
      <Card className="w-full max-w-[380px] animate-in">
        <CardHeader>
          <CardTitle><h1 className="text-[30px] leading-snug tracking-[-0.035em]">Create your account</h1></CardTitle>
          <CardDescription>
            Jobber is invite-only during MVP testing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inviteCode.trim().length >= 4 && (
            <div className="mb-5 space-y-3">
              <TelegramLoginButton invite={inviteCode.trim()} onDone={() => (window.location.href = '/dashboard/matches')} onError={setError} />
              <p className="text-center text-[13px] text-muted">or with email</p>
            </div>
          )}
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="invite" className="block text-sm font-medium mb-2">
                Invite code
              </label>
              <input
                id="invite"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Enter invite code"
                required
                className={fieldClass}
              />
              <p className="text-[13px] text-muted mt-1">
                Get an invite code from the owner
              </p>
            </div>

            {message && (
              <Notice tone="success">{message}</Notice>
            )}

            {error && (
              <Notice tone="danger">{error}</Notice>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted">Already have an account? </span>
            <Link href="/auth/signin" className="inline-flex min-h-11 min-w-11 items-center justify-center text-accent hover:underline">
              Sign in
            </Link>
          </div>

          <div className="mt-4 text-center">
            <Link href="/" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-accent">
              ← Back to home
            </Link>
          </div>
        </CardContent>
      </Card>
      </main>
    </div>
  );
}
