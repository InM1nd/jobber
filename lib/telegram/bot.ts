import { Bot, Context, webhookCallback } from 'grammy';
import { getPrisma } from '@/lib/db/prisma';

let botInstance: Bot | null = null;

function getBot(): Bot {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    botInstance = new Bot(token);
    setupBotCommands(botInstance);
  }
  return botInstance;
}

function setupBotCommands(bot: Bot) {
  bot.command('start', async (ctx) => {
    const telegramId = String(ctx.from?.id);
    const username = ctx.from?.username;

    const existingUser = await getPrisma().user.findUnique({
      where: { telegramId },
      include: { profile: true },
    });

    if (existingUser) {
      await ctx.reply(
        `Welcome back! 👋\n\n` +
        `You're already connected.\n` +
        `View your matches at ${process.env.NEXT_PUBLIC_APP_URL || 'the web app'}`
      );
      return;
    }

    await ctx.reply(
      `Welcome to Jobber! 🔍\n\n` +
      `To get started, please sign in via the web app:\n` +
      `${process.env.NEXT_PUBLIC_APP_URL || 'your-app-url'}\n\n` +
      `Your Telegram ID: \`${telegramId}\`\n` +
      `Use this to link your account.`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('link', async (ctx) => {
    const code = String(ctx.match || '').trim().toLowerCase();
    if (!code) {
      await ctx.reply('Send /link and the code from Settings. Example: /link a1b2c3');
      return;
    }

    try {
      const prisma = getPrisma();
      const link = await prisma.linkCode.findUnique({ where: { code } });
      if (!link || link.expiresAt < new Date()) {
        await ctx.reply('That code is expired or unknown. Create a new one in Settings.');
        return;
      }

      await prisma.user.update({
        where: { id: link.userId },
        data: {
          telegramId: String(ctx.from?.id),
          telegramUsername: ctx.from?.username || null,
        },
      });
      await prisma.linkCode.delete({ where: { id: link.id } });
      await ctx.reply('Telegram is linked. Daily digests and follow-up reminders will come here.');
    } catch {
      await ctx.reply('Could not link this chat. The Telegram id may already belong to another account.');
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `*Jobber Commands*\n\n` +
      `/start - Start or link account\n` +
      `/link CODE - Link this chat to your account\n` +
      `/help - Show this help\n` +
      `/matches - View recent matches\n` +
      `/profile - View your profile\n` +
      `/reminders - View follow-up reminders`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('matches', async (ctx) => {
    const telegramId = String(ctx.from?.id);
    
    const user = await getPrisma().user.findUnique({
      where: { telegramId },
      include: {
        matches: {
          where: {
            score: { gte: 60 },
          },
          include: { job: { include: { source: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!user) {
      await ctx.reply('Please link your account first via /start');
      return;
    }

    if (user.matches.length === 0) {
      await ctx.reply('No recent matches found. Check back later!');
      return;
    }

    let message = '*Recent Matches* 🎯\n\n';
    
    for (const match of user.matches) {
      message += `*${match.job.title}* at ${match.job.source.company}\n`;
      message += `Score: ${match.score}/100 (${match.priority})\n`;
      message += `${match.job.url}\n\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.command('profile', async (ctx) => {
    const telegramId = String(ctx.from?.id);
    
    const user = await getPrisma().user.findUnique({
      where: { telegramId },
      include: { profile: true },
    });

    if (!user) {
      await ctx.reply('Please link your account first via /start');
      return;
    }

    if (!user.profile) {
      await ctx.reply('No profile found. Please set up your profile in the web app.');
      return;
    }

    const profile = user.profile;
    
    let message = '*Your Profile* 📋\n\n';
    message += `Location: ${profile.location || 'Not set'}\n`;
    message += `Remote: ${profile.remoteOnly ? 'Yes' : 'No'}\n`;
    message += `Skills: ${profile.skills.length} skills\n`;
    message += `Languages: ${profile.languages.join(', ')}\n`;
    message += `\nEdit your profile at ${process.env.NEXT_PUBLIC_APP_URL || 'the web app'}`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.command('reminders', async (ctx) => {
    const telegramId = String(ctx.from?.id);
    
    const user = await getPrisma().user.findUnique({
      where: { telegramId },
      include: {
        applications: {
          where: {
            followUpAt: { lte: new Date() },
            followUpSent: false,
          },
          orderBy: { followUpAt: 'asc' },
        },
      },
    });

    if (!user) {
      await ctx.reply('Please link your account first via /start');
      return;
    }

    if (user.applications.length === 0) {
      await ctx.reply('No pending follow-ups! 🎉');
      return;
    }

    let message = '*Follow-up Reminders* ⏰\n\n';
    
    for (const app of user.applications) {
      message += `*${app.role}* at ${app.company}\n`;
      message += `Applied: ${app.appliedAt?.toLocaleDateString() || 'N/A'}\n`;
      message += `Follow up: ${app.followUpAt?.toLocaleDateString() || 'N/A'}\n\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });
}

export function handleTelegramWebhook(req: any) {
  const bot = getBot();
  return webhookCallback(bot, 'std/http')(req);
}

export async function sendTelegramMessage(telegramId: string, message: string) {
  try {
    const bot = getBot();
    await bot.api.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
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
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
          score: { gte: 70 },
        },
        include: { job: { include: { source: true } } },
        orderBy: { score: 'desc' },
        take: 10,
      },
    },
  });

  if (!user || !user.telegramId || user.matches.length === 0) {
    return;
  }

  let message = '🌅 *Daily Job Digest*\n\n';
  message += `Found ${user.matches.length} new matches:\n\n`;

  for (const match of user.matches) {
    message += `*${match.job.title}* at ${match.job.source.company}\n`;
    message += `Score: ${match.score}/100\n`;
    message += `Priority: ${match.priority}\n`;
    message += `${match.job.url}\n\n`;
  }

  await sendTelegramMessage(user.telegramId, message);
}
