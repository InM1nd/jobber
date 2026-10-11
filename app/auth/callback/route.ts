import { createClient } from '@/lib/db/supabase-server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { consumeInvite, linkEmailToUser } from '@/lib/data/service';
import { setSessionCookie } from '@/lib/auth/session';
import { open } from '@/lib/auth/signed';
import { getPrisma } from '@/lib/db/prisma';

export const instant = false;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const otpType = (requestUrl.searchParams.get('type') || 'email') as 'email' | 'magiclink' | 'signup';
  const fail = (reason: string) => {
    const target = new URL('/auth/signin', requestUrl.origin);
    target.searchParams.set('error', reason.slice(0, 200));
    return NextResponse.redirect(target);
  };
  const upstream = requestUrl.searchParams.get('error_description');
  if (upstream) return fail(upstream);

  if (code || tokenHash) {
    const supabase = await createClient();
    // token_hash works even when the link opens in a different browser than the one that asked
    // (e.g. requested in Telegram, opened in Gmail); the PKCE code needs the same browser.
    const { data, error } = tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType })
      : await supabase.auth.exchangeCodeForSession(code!);
    if (error) {
      return fail(
        /verifier|code challenge/i.test(error.message)
          ? 'Open the sign-in link in the same browser where you requested it, or request a new link here.'
          : /expired|invalid/i.test(error.message)
            ? 'This sign-in link has expired or was already used. Request a new one.'
            : error.message,
      );
    }

    if (!error && data.user) {
      // Linking an email from Settings: attach it to the signed-in account.
      // The token is signed server-side, so this works even when the magic link
      // opens in a different browser than the Telegram webview that asked for it.
      const token = requestUrl.searchParams.get('t') || '';
      const claim = requestUrl.searchParams.get('link') === 'email' && token
        ? open<{ uid?: string; purpose?: string; exp?: number }>(token)
        : null;
      const sessionUserId = claim?.purpose === 'link-email' && claim.uid && (claim.exp || 0) > Date.now() ? claim.uid : null;
      if (sessionUserId && data.user.email) {
        const linked = await linkEmailToUser(sessionUserId, data.user.email, data.user.id);
        const target = new URL('/dashboard/settings', requestUrl.origin);
        if (linked.ok) {
          target.searchParams.set('connected', 'Email');
          await setSessionCookie(sessionUserId);
        } else target.searchParams.set('error', linked.error);
        return NextResponse.redirect(target);
      }

      const prisma = getPrisma();
      let dbUser = await prisma.user.findFirst({
        where: {
          OR: [{ supabaseId: data.user.id }, { email: data.user.email! }],
        },
      });

      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            email: data.user.email!,
            supabaseId: data.user.id,
          },
        });
      } else if (dbUser.supabaseId !== data.user.id) {
        dbUser = await prisma.user.update({
          where: { id: dbUser.id },
          data: { supabaseId: data.user.id },
        });
      }

      const cookieStore = await cookies();
      const invite = cookieStore.get('jobber_invite')?.value;
      if (invite && !dbUser.invitedBy) {
        await consumeInvite(invite, dbUser.id);
        cookieStore.delete('jobber_invite');
      }

      await setSessionCookie(dbUser.id);
      return NextResponse.redirect(`${requestUrl.origin}/dashboard/matches`);
    }
  }

  return fail('The sign-in link was incomplete. Request a new one.');
}
