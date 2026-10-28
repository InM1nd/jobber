import { NextRequest } from 'next/server';
import { handleTelegramWebhook } from '@/lib/telegram/bot';

export const instant = false;
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // grammY reads the body itself; reading it here first made every update fail.
    return await handleTelegramWebhook(req);
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function GET() {
  return new Response('Telegram webhook endpoint', { status: 200 });
}
