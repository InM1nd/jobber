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

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

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

  return NextResponse.redirect(`${requestUrl.origin}/auth/signin?error=callback`);
}
