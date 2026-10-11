import { createClient } from '@/lib/db/supabase-server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { consumeInvite } from '@/lib/data/service';
import { getPrisma } from '@/lib/db/prisma';

export const instant = false;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
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

      return NextResponse.redirect(`${requestUrl.origin}/dashboard/matches`);
    }
  }

  return NextResponse.redirect(`${requestUrl.origin}/auth/signin?error=callback`);
}
