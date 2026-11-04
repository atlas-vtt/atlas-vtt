import { getDomHost } from '../../host/dom';
import { Texture } from 'pixi.js';
import { toError } from '../../utils/errors';

/**
 * Rasterises Lucide icon markup (the inner `<path>`/`<circle>`/… elements of a
 * 24×24 Lucide icon) into a PIXI texture.
 *
 * SVG → data URI → Image → Canvas → Texture is the only reliable path in
 * PIXI v8; `Texture.from(svgString)` is not supported.
 */
export async function createLucideIconTexture(
  innerSvg: string,
  color: string,
  size: number
): Promise<Texture> {
  const canvas = getDomHost().createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[lucideIconTexture] Could not acquire 2D context');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${innerSvg}</svg>`;

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (err) => reject(toError(err, 'Failed to load icon SVG'));
    img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  });

  ctx.drawImage(img, 0, 0, size, size);
  return Texture.from(canvas);
}
