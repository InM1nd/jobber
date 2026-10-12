import { extractText, getDocumentProxy } from 'unpdf';

/** PDF → text. unpdf bundles a serverless pdf.js build (no worker file, no canvas), so it works on Vercel. */
export async function pdfToText(data: ArrayBuffer | Uint8Array) {
  const pdf = await getDocumentProxy(data instanceof Uint8Array ? data : new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/[ \t]+\n/g, '\n').trim();
}
