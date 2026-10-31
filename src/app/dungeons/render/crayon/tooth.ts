import { boundedCached } from '../boundedCache';
import type { Canvas2D } from '../geometry';
import { DEFAULT_PX_PER_CELL } from '../layoutSize';
import { parseHex } from '../palette';
import { poreTile } from '../vellumSkin';

/**
 * The paper's tooth: wax stays on the paper's peaks and leaves its valleys bare, so a crayon's
 * colour is a pattern of it with holes where the paper is low, the same grain the vellum's pores
 * are made of. The grain belongs to the paper, not to the stroke: every stroke of every colour
 * breaks up on the same tooth, anchored to the map.
 */

/** The tile's side in texels and the cells it covers: a texel a pixel on a scene's map (a tile scaled up blurs the grain). */
const TILE_PX = 3 * DEFAULT_PX_PER_CELL;
const TILE_CELLS = 3;
const TOOTH_SEED = 0x7007;
/**
 * How much of the colour the paper keeps on average, and how strongly its grain moves that. Firmer
 * than Dolmenwood's `CRAYON_MAP_FILTER` (0.6 ± 0.33): a map at play zoom shows its grain a pixel or
 * two large, where that many bare holes read as speckle rather than crayon.
 */
const KEPT = 0.78;
const DEPTH = 0.24;
/** The pores' deviations, back to one standard deviation (`poreTile` scales them to 1 %). */
const PORE_SCALE = 100;
const TILE_LIMIT = 16;

let grain: Float32Array | null = null;
const tiles = new Map<string, OffscreenCanvas>();

function toothTile(colour: string): OffscreenCanvas {
  grain ??= poreTile(TILE_PX, TOOTH_SEED);
  const [r, g, b] = parseHex(colour);
  const pixels = new Uint8ClampedArray(TILE_PX * TILE_PX * 4);
  grain.forEach((d, i) => {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = Math.max(0, Math.min(1, KEPT + DEPTH * d * PORE_SCALE)) * 255;
  });
  const tile = new OffscreenCanvas(TILE_PX, TILE_PX);
  tile.getContext('2d')!.putImageData(new ImageData(pixels, TILE_PX), 0, 0);
  return tile;
}

/** `colour` on the paper's tooth, for a context drawing pictures in cells; the colour itself where no pattern can be placed. */
export function crayonPaint(ctx: Canvas2D, colour: string): string | CanvasPattern {
  if (typeof DOMMatrix === 'undefined') return colour;
  const pattern = ctx.createPattern(boundedCached(tiles, colour, TILE_LIMIT, () => toothTile(colour)), 'repeat');
  if (!pattern) return colour;
  const scale = TILE_CELLS / TILE_PX;
  pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
  return pattern;
}
