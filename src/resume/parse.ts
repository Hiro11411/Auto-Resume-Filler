import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface TextItem {
  str: string;
  transform: number[];
  hasEOL?: boolean;
}

/** PDF text with line breaks rebuilt from glyph positions (pdf.js returns loose runs). */
async function pdfText(data: ArrayBuffer): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let y: number | null = null;
    let line = '';
    for (const item of content.items as TextItem[]) {
      if (!('str' in item)) continue;
      const iy = Math.round(item.transform[5]);
      if (y !== null && Math.abs(iy - y) > 2) {
        lines.push(line.trim());
        line = '';
      }
      y = iy;
      line += (line && !line.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str;
      if (item.hasEOL) {
        lines.push(line.trim());
        line = '';
        y = null;
      }
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines.filter(Boolean).join('\n');
}

export async function resumeToText(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return pdfText(data);
  if (name.endsWith('.docx')) {
    const { value } = await mammoth.extractRawText({ arrayBuffer: data });
    return value;
  }
  if (name.endsWith('.txt')) return new TextDecoder().decode(data);
  throw new Error('Unsupported file type. Use PDF or DOCX.');
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
