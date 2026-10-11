import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db/prisma';
import { sendTelegramMessage } from '@/lib/telegram/bot';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const prisma = getPrisma();
  const due = await prisma.application.findMany({
    where: {
      followUpSent: false,
      followUpAt: { lte: new Date() },
      status: 'applied',
    },
    include: { user: true },
    take: 30,
  });

  let sent = 0;
  for (const app of due) {
    if (!app.user.telegramId) continue;
    const message =
      `*Follow-up due*\n\n` +
      `${app.role} at ${app.company}\n` +
      `Applied: ${app.appliedAt?.toLocaleDateString() || 'unknown'}\n` +
      `A short note, 2–4 sentences, is enough. No pressure.`;
    await sendTelegramMessage(app.user.telegramId, message);
    await prisma.application.update({
      where: { id: app.id },
      data: { followUpSent: true },
    });
    sent += 1;
  }

  return NextResponse.json({ due: due.length, sent });
}
