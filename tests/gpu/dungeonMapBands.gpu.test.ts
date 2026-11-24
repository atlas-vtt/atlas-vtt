import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { bandRows, drawInBands } from '../../src/app/dungeons/worker/mapBands';

/**
 * The dungeon worker draws every map in bands, so no canvas grows large enough to exhaust the
 * graphics card. A picture whose every edge lies on whole pixels comes out of the bands as drawn
 * whole, pixel for pixel; a map that fits one band is the map drawn whole. (A map over several bands
 * is not: Chromium antialiases a few edge pixels differently on a canvas of another size.)
 */

type Draw = (ctx: OffscreenCanvasRenderingContext2D) => void;

function drawnWhole(width: number, height: number, draw: Draw): Uint8ClampedArray {
  const ctx = new OffscreenCanvas(width, height).getContext('2d')!;
  draw(ctx);
  return ctx.getImageData(0, 0, width, height).data;
}

function differing(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let n = 0;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) n++;
  return n;
}

/** Whole-pixel rectangles, a pattern, a picture and a strip laid as `paintLayer` lays one: through the transform it reads back. */
const aligned: Draw = (ctx) => {
  ctx.fillStyle = '#d8c8a0';
  ctx.fillRect(0, 0, 301, 517);
  ctx.save();
  ctx.translate(7, 13);
  ctx.scale(2, 2);
  ctx.fillStyle = '#802010';
  for (let k = 0; k < 40; k++) ctx.fillRect(k * 3, k * 6, 5, 4);
  const tile = new OffscreenCanvas(4, 4);
  const t = tile.getContext('2d')!;
  t.fillStyle = '#103080';
  t.fillRect(0, 0, 2, 2);
  t.fillRect(2, 2, 2, 2);
  ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
  ctx.fillRect(10, 100, 60, 90);
  const m = ctx.getTransform();
  const strip = new OffscreenCanvas(50, 30);
  const s = strip.getContext('2d')!;
  s.fillStyle = '#20a040';
  s.fillRect(5, 5, 40, 20);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(strip, 0, 0, 50, 30, m.e + 100, m.f + 300, 50, 30);
  ctx.restore();
};

describe('a picture drawn in bands', () => {
  it('is the picture drawn whole where every edge lies on whole pixels, seams included', async () => {
    const [width, height] = [301, 517];
    const maxPixels = width * 61;
    expect(height / bandRows(width, maxPixels)).toBeGreaterThan(8);
    const banded = await drawInBands(width, height, aligned, maxPixels);
    expect(differing(drawnWhole(width, height, aligned), banded.data)).toBe(0);
  });

  it('is the map drawn whole where the map fits one band', async () => {
    const model = generateDungeon({ seed: 4242, theme: 'fortress', tags: ['medium'], floors: 2 });
    const style = dungeonStyle('crayon');
    const { widthPx, heightPx } = mapLayout(model, 40, DEFAULT_VIEW);
    const draw: Draw = (ctx) => void renderMap(ctx, model, style, DEFAULT_VIEW, { pxPerCell: 40, floor: 1 });
    const banded = await drawInBands(widthPx, heightPx, draw, widthPx * heightPx);
    expect(differing(drawnWhole(widthPx, heightPx, draw), banded.data)).toBe(0);
  });
});
