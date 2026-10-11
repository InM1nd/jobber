import { NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { requireUser, saveProfile } from '@/lib/data/service';
import { extractCvProfile } from '@/lib/ai/cv-profile';
import { aiErrorResponse } from '@/lib/ai/errors';
import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;
export const maxDuration = 60;
const MAX_CVS = 6;

async function pdfText(file: File) {
  const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    return (await parser.getText()).text.replace(/\s+\n/g, '\n').trim();
  } finally {
    await parser.destroy();
  }
}

function autoLabel(headline: string | null, roles: string[], fileName: string | null) {
  const fromFile = fileName?.replace(/\.pdf$/i, '').replace(/^cv[_\s-]*/i, '').replace(/[_-]+/g, ' ').trim();
  return (roles[0] || headline || fromFile || 'My CV').slice(0, 40);
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ cvs: [] });
  const cvs = await getPrisma().cv.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ cvs: cvs.map((c) => ({ id: c.id, label: c.label, fileName: c.fileName, characters: c.text.length, parsed: c.parsed })) });
}

/** Adds a CV: multipart {file: PDF, label?} or JSON {text, label?}. Reads it with AI (1 request). */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: 'Needs the database (demo mode).' }, { status: 503 });
  const prisma = getPrisma();
  if ((await prisma.cv.count({ where: { userId: user.id } })) >= MAX_CVS) {
    return NextResponse.json({ error: `You can keep up to ${MAX_CVS} CVs. Remove one first.` }, { status: 400 });
  }

  let text = '';
  let fileName: string | null = null;
  let label = '';
  const type = request.headers.get('content-type') || '';
  if (type.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    label = String(form.get('label') || '');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a PDF file' }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'PDF must be under 5 MB' }, { status: 400 });
    if (file.type && file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files work here — or paste the text.' }, { status: 400 });
    try {
      text = await pdfText(file);
    } catch {
      return NextResponse.json({ error: 'Could not read that PDF. Paste the text instead.' }, { status: 422 });
    }
    fileName = file.name.slice(0, 180);
  } else {
    const body = (await request.json().catch(() => ({}))) as { text?: string; label?: string };
    text = String(body.text || '').trim();
    label = String(body.label || '');
  }
  if (text.length < 200) {
    return NextResponse.json(
      { error: fileName ? 'That PDF has almost no text (is it a scan?). Paste the text instead.' : 'Paste a bit more — the full CV text works best.' },
      { status: 422 },
    );
  }

  try {
    const parsed = await extractCvProfile(user.id, text);
    const cv = await prisma.cv.create({
      data: {
        userId: user.id,
        label: label.trim().slice(0, 40) || autoLabel(parsed.headline, parsed.targetRoles, fileName),
        fileName,
        text: text.slice(0, 50_000),
        parsed: parsed as object,
      },
    });
    // Keep the legacy single-CV column filled (letters, older code paths).
    const count = await prisma.cv.count({ where: { userId: user.id } });
    if (count === 1) await saveProfile(user.id, { cvText: cv.text, ...(fileName ? { cvFileName: fileName } : {}) });
    return NextResponse.json({ cv: { id: cv.id, label: cv.label, fileName, characters: text.length }, parsed });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
