import { NextRequest, NextResponse } from 'next/server';
import { runAgentDrafts } from '@/lib/agent/drafts';

export const maxDuration = 60;

/** Daily, after scoring: cover-letter drafts for the best new matches (never sent). */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ message: 'Drafts complete', ...(await runAgentDrafts(Date.now() + 50_000)) });
  } catch (error) {
    console.error('Agent drafts cron error', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to draft' }, { status: 500 });
  }
}
