import { linkApplications, notTracked } from '@/lib/tracker/link';
import { Bot, webhookCallback } from 'grammy';
import { getPrisma } from '@/lib/db/prisma';
import { miniAppUrl } from '@/lib/telegram/mini-app';
import { readLinkCode } from '@/lib/auth/link-code';
import { linkTelegramToUser, signInWithTelegram } from '@/lib/data/service';
import { confirmLogin, loginInvite } from '@/lib/auth/bot-login';
import { loginStore } from '@/lib/auth/bot-login-store';

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
    const payload = String(ctx.match || '').trim();
    if (payload.startsWith('login_')) {
      const token = payload.slice(6);
      const req = await loginInvite(loginStore(), token);
      if (!req.ok) {
        await ctx.reply('This sign-in request has expired. Go back to the Jobber website and tap “Sign in with Telegram” again.');
        return;
      }
      await ctx.reply(
        'Sign in to Jobber on the web as this Telegram account?\n\nOnly tap “Yes” if you just pressed “Sign in with Telegram” on jobber-check.vercel.app yourself.',
        { reply_markup: { inline_keyboard: [[{ text: 'Yes, sign me in', callback_data: `L:${token}` }]] } },
      );
      return;
    }
    if (payload.startsWith('link_')) {
      const userId = readLinkCode(payload.slice(5));
      if (!userId || !ctx.from) {
        await ctx.reply('This link has expired. Open Settings on the web and tap “Link Telegram” again.');
        return;
      }
      const linked = await linkTelegramToUser(userId, String(ctx.from.id), ctx.from.username);
      await ctx.reply(
        linked.ok
          ? 'Telegram is now linked to your Jobber account. The app and the website share the same data.'
          : linked.error,
      );
      await publishMenuButton(bot, ctx.chat.id);
      return;
    }
    const invite = payload;
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

  bot.callbackQuery(/^L:(.+)$/, async (ctx) => {
    const token = ctx.match[1];
    const store = loginStore();
    const req = await loginInvite(store, token);
    if (!req.ok || !ctx.from) {
      await ctx.answerCallbackQuery({ text: 'This request has expired — start again on the website.', show_alert: true });
      return;
    }
    const result = await signInWithTelegram({ telegramId: String(ctx.from.id), username: ctx.from.username, startParam: req.invite });
    if ('error' in result) {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('You don’t have a Jobber account yet. Jobber is invite-only for now — ask the person who told you about it for an invite link, open it, then sign in again.');
      return;
    }
    const link = await confirmLogin(store, token, result.user.id);
    if (!link) {
      await ctx.answerCallbackQuery({ text: 'This request was already used or expired.', show_alert: true });
      return;
    }
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://jobber-check.vercel.app';
    const url = new URL('/auth/telegram-link', base);
    url.searchParams.set('token', link.token);
    url.searchParams.set('sig', link.sig);
    await ctx.answerCallbackQuery({ text: 'Signed in' });
    await ctx.editMessageText(
      'Done — the Jobber tab you came from will sign in by itself in a few seconds.\n\nOn another device or browser? Use this button (works once, for 5 minutes):',
      { reply_markup: { inline_keyboard: [[{ text: 'Sign in to Jobber', url: url.toString() }]] } },
    );
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
  const profile = await getPrisma().profile.findUnique({ where: { userId }, select: { alertFrequency: true, alertThreshold: true } });
  if (profile?.alertFrequency === 'off' || profile?.alertFrequency === 'instant') return;
  await linkApplications(userId).catch(() => []);
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    include: {
      matches: {
        where: {
          ...notTracked(userId),
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          score: { gte: profile?.alertThreshold ?? 70 },
          filtered: false,
        },
        include: { job: { include: { source: true } } },
        orderBy: { score: 'desc' },
        take: 10,
      },
    },
  });

  if (!user?.telegramId || user.matches.length === 0) return;

  const lines = user.matches.map(
    (match) => `${match.job.title} at ${match.job.company || match.job.source.company}\nScore ${match.score} · ${match.priority}\n${match.job.url}`,
  );
  await sendTelegramMessage(user.telegramId, `Daily matches\n\n${lines.join('\n\n')}`);
}
