import { NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { requireUser, saveProfile } from '@/lib/data/service';

export const instant = false;

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Choose a PDF file' }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'PDF must be under 5 MB' }, { status: 400 });
  }
  if (file.type && file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    const text = result.text.replace(/\s+\n/g, '\n').trim();
    if (!text) {
      return NextResponse.json({ error: 'No text found in that PDF' }, { status: 422 });
    }
    await saveProfile(user.id, {
      cvText: text.slice(0, 50000),
      cvFileName: file.name.slice(0, 180),
    });
    return NextResponse.json({ characters: text.length, fileName: file.name });
  } finally {
    await parser.destroy();
  }
}
