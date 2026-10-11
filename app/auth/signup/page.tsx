'use client';

import { useState } from 'react';
import { createClient } from '@/lib/db/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
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
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create Your Account</CardTitle>
          <CardDescription>
            Jobber is invite-only during MVP testing
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                className="w-full rounded-[12px] border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
              />
            </div>

            <div>
              <label htmlFor="invite" className="block text-sm font-medium mb-2">
                Invite Code
              </label>
              <input
                id="invite"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Enter invite code"
                required
                className="w-full rounded-[12px] border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
              />
              <p className="text-xs text-muted mt-1">
                Get an invite code from the owner
              </p>
            </div>

            {message && (
              <div className="rounded-[12px] bg-success-soft p-3 text-sm text-success">
                {message}
              </div>
            )}

            {error && (
              <div className="rounded-[12px] bg-danger-soft p-3 text-sm text-danger">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted">Already have an account? </span>
            <Link href="/auth/signin" className="text-accent hover:underline">
              Sign in
            </Link>
          </div>

          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-muted hover:text-accent">
              ← Back to home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
