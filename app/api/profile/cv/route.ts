import { NextResponse } from 'next/server';
import { pdfToText } from '@/lib/pdf';
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
  let text = '';
  try {
    text = await pdfToText(bytes);
  } catch (e) {
    console.error('[profile/cv] pdf parse failed', e);
    return NextResponse.json({ error: 'Could not read that PDF. Paste the text instead.' }, { status: 422 });
  }
  {
    if (!text) {
      return NextResponse.json({ error: 'No text found in that PDF' }, { status: 422 });
    }
    await saveProfile(user.id, {
      cvText: text.slice(0, 50000),
      cvFileName: file.name.slice(0, 180),
    });
    return NextResponse.json({ characters: text.length, fileName: file.name });
  }
}
