import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db/prisma';
import { checkAgentAuth, getOwner } from '@/lib/agent/api';
import { aiErrorResponse } from '@/lib/ai/errors';
import { parseDrafts } from '@/lib/apply/format';
import { prepareApplication, PrepareError } from '@/lib/apply/prepare';

export const instant = false;
export const maxDuration = 60;

/** GET: saved application-form drafts (read-only keys OK). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkAgentAuth(request);
  if (denied) return denied;
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner user not found' }, { status: 404 });
  const { id } = await params;
  const app = await getPrisma().application.findFirst({ where: { id, userId: owner.id }, select: { coverLetter: true } });
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ drafts: parseDrafts(app.coverLetter) });
}

/** POST: generate drafts (write keys only; uses the owner's normal AI limits). Never submits anything. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkAgentAuth(request);
  if (denied) return denied;
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner user not found' }, { status: 404 });
  const { id } = await params;
  try {
    return NextResponse.json({ drafts: await prepareApplication(owner.id, id) });
  } catch (error) {
    if (error instanceof PrepareError) return NextResponse.json({ error: error.message }, { status: error.status });
    return aiErrorResponse(error);
  }
}
