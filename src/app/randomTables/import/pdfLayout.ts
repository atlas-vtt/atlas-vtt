/** PDF text in page coordinates, with y increasing downwards. */
export interface PdfSpan {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfLine {
  y: number;
  height: number;
  spans: PdfSpan[];
}

/** Preserve cell gaps while joining adjacent glyph/word fragments. */
export function groupPdfSpans(line: PdfLine): PdfSpan[][] {
  const groups: PdfSpan[][] = [];
  for (const span of line.spans) {
    const last = groups.at(-1);
    const previous = last?.at(-1);
    if (previous && span.x - previous.x - previous.width < line.height * 1.4) last!.push(span);
    else groups.push([span]);
  }
  return groups;
}

/** Sort by geometry, not the PDF's drawing order. Keep columns and cell gaps separate. */
export function pdfLines(spans: readonly PdfSpan[]): PdfLine[] {
  const sorted = spans.filter((span) => span.text.trim() !== '').toSorted((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const span of sorted) {
    const last = lines.at(-1);
    if (last && Math.abs(span.y - last.y) <= Math.min(span.height, last.height) * 0.3) {
      last.spans.push(span);
      last.height = Math.max(last.height, span.height);
    } else lines.push({ y: span.y, height: span.height, spans: [span] });
  }
  for (const line of lines) line.spans.sort((a, b) => a.x - b.x);
  return lines;
}

/** Join glyph fragments within one cell, preserving actual inter-word gaps. */
export function spanText(spans: readonly PdfSpan[]): string {
  let text = '';
  let previous: PdfSpan | undefined;
  for (const span of spans) {
    const space = previous && span.x - (previous.x + previous.width) > Math.min(previous.height, span.height) * 0.15;
    text += `${space && !text.endsWith(' ') && !span.text.startsWith(' ') ? ' ' : ''}${span.text}`;
    previous = span;
  }
  return text.replace(/[\u00a0\u2007\u202f]/g, ' ').trim();
}

/** A page's text items are untrusted; non-horizontal text cannot be reconstructed as rows. */
export function spansFromPdfItems(items: readonly unknown[], transform: readonly number[]): PdfSpan[] | null {
  const spans: PdfSpan[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null || !('str' in item)) continue;
    if (typeof item.str !== 'string' || !('transform' in item) || !Array.isArray(item.transform)
      || item.transform.length !== 6 || !item.transform.every((part): part is number => typeof part === 'number' && Number.isFinite(part))
      || !('width' in item) || typeof item.width !== 'number' || !Number.isFinite(item.width)
      || !('height' in item) || typeof item.height !== 'number' || !Number.isFinite(item.height)) return null;
    if (item.str.trim() === '') continue;
    const [a, b, c, d, e, f] = item.transform;
    const [va, vb, vc, vd, ve, vf] = transform;
    if (va === undefined || vb === undefined || vc === undefined || vd === undefined || ve === undefined || vf === undefined) return null;
    const horizontal = va * a! + vc * b!;
    const vertical = vb * a! + vd * b!;
    if (Math.abs(vertical) > Math.abs(horizontal) * 0.05 || horizontal <= 0 || item.height <= 0 || item.width < 0) return null;
    // Ignore the rotated page if its text cannot be read left to right in this viewport.
    if (Math.abs(va * c! + vc * d!) > item.height * 0.05) return null;
    spans.push({ text: item.str, x: va * e! + vc * f! + ve, y: vb * e! + vd * f! + vf, width: item.width, height: item.height });
  }
  return spans;
}
