import { getDomHost } from '../host/dom';

/** Copies of the shape around the circle that grows it; enough that the grown edge shows no corners. */
const DIRECTIONS = 32;

/** A copy of a canvas, so a stage's canvas can draw on while what it showed is kept. */
export function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = getDomHost().createCanvas();
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext('2d')?.drawImage(source, 0, 0);
  return copy;
}

/** `shape` grown by `radius` pixels: copies of it moved round a circle, so the edge keeps its smoothing. */
function grown(shape: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const canvas = copyCanvas(shape);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  for (let i = 0; i < DIRECTIONS; i++) {
    const angle = (i / DIRECTIONS) * Math.PI * 2;
    ctx.drawImage(shape, Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return canvas;
}

/**
 * A ring round a shape, `gap` pixels off its edge and `width` wide, white on transparent, as an image URL: a mask the
 * page colours. `shape` is the shape alone (a die drawn without its shadow), its alpha the outline.
 */
export function outlineRing(shape: HTMLCanvasElement, gap: number, width: number): string {
  const ring = grown(shape, gap + width);
  const ctx = ring.getContext('2d');
  if (!ctx) return ring.toDataURL('image/png');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(grown(shape, gap), 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ring.width, ring.height);
  return ring.toDataURL('image/png');
}
