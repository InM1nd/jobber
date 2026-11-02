import { getPrisma } from '@/lib/db/prisma';
import { getMatch, saveCoverLetter } from '@/lib/data/service';
import { letterInputs } from '@/lib/apply/letter-inputs';
import { generateCoverLetter, letterUnverified } from '@/lib/llm/matcher';
import { userChatClient } from '@/lib/ai/shared-client';
import { parseAiMeta, stamp } from '@/lib/ai/meta';
import { sendTelegramButtons } from '@/lib/telegram/bot';

/**
 * After "apply" in Review: write the cover letter if there isn't one (one AI "write"), then send the
 * user everything to apply in one Telegram message — the employer's link, the letter to copy, and
 * "✅ Sent", which moves the tracker row to Applied. Nothing is sent to the employer.
 */
export async function prepareApplyPack(userId: string, matchId: string, applicationId: string) {
  const prisma = getPrisma();
  const match = await getMatch(userId, matchId);
  if (!match) return;
  let letter = match.coverLetter;
  let unverified = parseAiMeta(match.aiMeta).letter?.unverified ?? [];
  let note = '';
  if (!letter) {
    try {
      const { profileInput, jobInput } = await letterInputs(userId, match);
      if (profileInput.cvText) {
        letter = await generateCoverLetter(userChatClient(userId, 'write', 'smart', 25_000), profileInput, jobInput);
        unverified = letterUnverified(letter, profileInput, jobInput);
        await saveCoverLetter(userId, matchId, letter, stamp('letter', unverified, { cause: 'generated' }));
      } else note = 'No CV in your profile yet, so no letter was written.';
    } catch (e) {
      console.error('apply pack letter', e instanceof Error ? e.message : e);
      note = /quota|limit|budget/i.test(e instanceof Error ? e.message : '')
        ? 'Today’s AI limit is used up — write the letter in the app or tomorrow.'
        : 'The letter couldn’t be written right now — try “Write letter” in the app.';
    }
  }
  await prisma.application.updateMany({
    where: { id: applicationId, userId, nextAction: 'Send the application (letter is being prepared)' },
    data: { nextAction: letter ? 'Send the application — letter ready' : 'Write the letter and send the application' },
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
  if (!user?.telegramId) return;
  const base = process.env.NEXT_PUBLIC_APP_URL || '';
  const text = [
    `Ready to apply · ${match.score}`,
    `${match.job.title} — ${match.job.company}`,
    '',
    letter ? `Cover letter (tap and hold to copy):\n\n${letter}` : note,
    unverified.length ? `\nCheck before sending: ${unverified.slice(0, 5).join(', ')}` : '',
    '\nApply on the employer’s page, then tap “✅ Sent” — the tracker moves it to Applied and sets a follow-up.',
  ].filter((l) => l !== '').join('\n');
  await sendTelegramButtons(user.telegramId, text, [
    match.job.url ? [{ text: 'Open the application page', url: match.job.url }] : [],
    [{ text: '✅ Sent', callback_data: `A:${applicationId}` }],
    base ? [{ text: 'Edit the letter in Jobber', web_app: { url: `${base}/dashboard/matches/${matchId}` } }] : [],
  ]);
}
