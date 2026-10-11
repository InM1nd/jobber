import { Bot, webhookCallback } from 'grammy';
import { getPrisma } from '@/lib/db/prisma';
import { miniAppUrl } from '@/lib/telegram/mini-app';

let botInstance: Bot | null = null;

function getBot(): Bot {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
    botInstance = new Bot(token);
    setupBotCommands(botInstance);
  }
  return botInstance;
}

async function publishMenuButton(bot: Bot, chatId?: number) {
  const url = miniAppUrl();
  if (!url) return;
  await bot.api.setChatMenuButton({
    chat_id: chatId,
    menu_button: {
      type: 'web_app',
      text: 'Open',
      web_app: { url },
    },
  });
}

function setupBotCommands(bot: Bot) {
  bot.command('start', async (ctx) => {
    const invite = String(ctx.match || '').trim();
    const url = miniAppUrl(invite || undefined);
    await publishMenuButton(bot, ctx.chat.id);

    if (!url) {
      await ctx.reply('Jobber is not configured with a public app URL yet.');
      return;
    }

    const text = invite
      ? 'Open Jobber to accept this invite and see your matches.'
      : 'Jobber scores new roles against your profile and drafts the letter. Open the app to start.';

    await ctx.reply(text, {
      reply_markup: {
        inline_keyboard: [[{ text: 'Open Jobber', web_app: { url } }]],
      },
    });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        'Open Jobber from the button under the message, or from the menu button.',
        '',
        '/start — open the app',
        '/matches — recent scores',
        '/profile — profile summary',
        '/reminders — follow-ups that are due',
      ].join('\n'),
    );
  });

  bot.command('matches', async (ctx) => {
    try {
      const user = await getPrisma().user.findUnique({
        where: { telegramId: String(ctx.from?.id) },
        include: {
          matches: {
            where: { score: { gte: 60 } },
            include: { job: { include: { source: true } } },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });
      if (!user) {
        await ctx.reply('Open Jobber from /start first.');
        return;
      }
      if (user.matches.length === 0) {
        await ctx.reply('No recent matches. Check the app later.');
        return;
      }
      const lines = user.matches.map(
        (match) => `${match.job.title} at ${match.job.source.company} — ${match.score}/100\n${match.job.url}`,
      );
      await ctx.reply(lines.join('\n\n'));
    } catch {
      await ctx.reply('Matches are unavailable until the database is connected.');
    }
  });

  bot.command('profile', async (ctx) => {
    try {
      const user = await getPrisma().user.findUnique({
        where: { telegramId: String(ctx.from?.id) },
        include: { profile: true },
      });
      if (!user?.profile) {
        await ctx.reply('No profile yet. Open the app and fill it in.');
        return;
      }
      const profile = user.profile;
      await ctx.reply(
        [
          `Location: ${profile.location || 'not set'}`,
          `Remote only: ${profile.remoteOnly ? 'yes' : 'no'}`,
          `Skills: ${profile.skills.length}`,
          `Languages: ${profile.languages.join(', ') || 'not set'}`,
        ].join('\n'),
      );
    } catch {
      await ctx.reply('Profile is unavailable until the database is connected.');
    }
  });

  bot.command('reminders', async (ctx) => {
    try {
      const user = await getPrisma().user.findUnique({
        where: { telegramId: String(ctx.from?.id) },
        include: {
          applications: {
            where: { followUpAt: { lte: new Date() }, followUpSent: false },
            orderBy: { followUpAt: 'asc' },
          },
        },
      });
      if (!user) {
        await ctx.reply('Open Jobber from /start first.');
        return;
      }
      if (user.applications.length === 0) {
        await ctx.reply('No pending follow-ups.');
        return;
      }
      const lines = user.applications.map(
        (app) => `${app.role} at ${app.company}\nFollow up: ${app.followUpAt?.toLocaleDateString() || 'n/a'}`,
      );
      await ctx.reply(lines.join('\n\n'));
    } catch {
      await ctx.reply('Reminders are unavailable until the database is connected.');
    }
  });
}

export function handleTelegramWebhook(req: Request) {
  const bot = getBot();
  return webhookCallback(bot, 'std/http')(req);
}

export async function sendTelegramMessage(telegramId: string, message: string) {
  try {
    const bot = getBot();
    await bot.api.sendMessage(telegramId, message);
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
}

export async function sendDailyDigest(userId: string) {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    include: {
      matches: {
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          score: { gte: 70 },
        },
        include: { job: { include: { source: true } } },
        orderBy: { score: 'desc' },
        take: 10,
      },
    },
  });

  if (!user?.telegramId || user.matches.length === 0) return;

  const lines = user.matches.map(
    (match) => `${match.job.title} at ${match.job.source.company}\nScore ${match.score} · ${match.priority}\n${match.job.url}`,
  );
  await sendTelegramMessage(user.telegramId, `Daily matches\n\n${lines.join('\n\n')}`);
}
