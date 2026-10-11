import { NextRequest } from 'next/server';
import { handleTelegramWebhook } from '@/lib/telegram/bot';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    
    const response = await handleTelegramWebhook(req as any);
    
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function GET() {
  return new Response('Telegram webhook endpoint', { status: 200 });
}
