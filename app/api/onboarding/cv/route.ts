import { NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { requireUser, saveProfile } from '@/lib/data/service';
import { extractCvProfile } from '@/lib/ai/cv-profile';
import { consumeOne } from '@/lib/ai/quota';
import { aiErrorResponse } from '@/lib/ai/errors';

export const instant = false;
export const maxDuration = 60;

async function pdfText(file: File) {
  const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    return (await parser.getText()).text.replace(/\s+\n/g, '\n').trim();
  } finally {
    await parser.destroy();
  }
}

/** Accepts multipart {file: PDF} or JSON {text}. Returns the AI's reading of the CV. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  let text = '';
  let fileName: string | null = null;
  const type = request.headers.get('content-type') || '';
  if (type.includes('multipart/form-data')) {
    const file = (await request.formData()).get('file');
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
    const body = (await request.json().catch(() => ({}))) as { text?: string };
    text = String(body.text || '').trim();
  }
  if (text.length < 200) {
    return NextResponse.json(
      { error: fileName ? 'That PDF has almost no text (is it a scan?). Paste the text instead.' : 'Paste a bit more — the full CV text works best.' },
      { status: 422 },
    );
  }

  try {
    await consumeOne(user.id, 'parse');
    const profile = await extractCvProfile(text);
    await saveProfile(user.id, { cvText: text.slice(0, 50_000), ...(fileName ? { cvFileName: fileName } : {}) });
    return NextResponse.json({ profile, characters: text.length, fileName });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
