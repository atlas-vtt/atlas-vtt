/**
 * Where a level's own map leaves its floor open: the transparent parts of its image and
 * everything outside the image, on the stack's grid (`LevelStack`). Conservative by construction:
 * a texel is open only where no pixel of the image that its square touches holds art, and then
 * only where the eight texels around it are open too, so anti-aliased edges and the rounding of
 * a map's overview never open the floor under art.
 */

import { worldToImage, type MapStretch } from '../grid/mapStretch';
import type { StackGrid } from './levelStack';
import type { TexelBox } from './surfaceRaster';

/** A pixel of a level's map at most this opaque (of 255) is transparent: it opens the floor to the levels below. */
export const OPEN_ALPHA_BYTE = 8;

/**
 * Which pixels of a map image hold art, read from its overview (the whole image fit within
 * `width` × `height`): one byte each, row by row, 1 where the alpha is above `OPEN_ALPHA_BYTE`.
 */
export interface ArtAlpha {
  width: number;
  height: number;
  opaque: Uint8Array;
}

/** A level's map image as the stack reads it. */
export interface LevelArt {
  /** The image's own size in pixels (its pyramid's: a video's poster, the size an `<img>` gives an SVG). */
  width: number;
  height: number;
  /** Which of its pixels hold art; null where that is not known, which holds art everywhere. */
  alpha: ArtAlpha | null;
}

/** A level's art on the stack's grid: 1 where it leaves the floor open, and the box of those texels (null: none). */
export interface ArtCells {
  open: Uint8Array;
  box: TexelBox | null;
}

/** Every pixel holds art: a map whose transparency is not known or not looked at. */
const SOLID: ArtAlpha = { width: 1, height: 1, opaque: new Uint8Array([1]) };
/** A texel's edge reaching this close to a pixel's, in pixels, touches it. */
const TOUCH = 1e-6;

/**
 * Level art on `grid`: open where the image drawn by `placement` holds no art in a texel's square
 * (outside the image counts as no art), then shrunk by one texel wherever art is near. Without
 * `opensArt` (the level's `openArt` is off) every pixel of the image holds art, and only what lies
 * outside it is open. Given `area`, only its texels are worked out (a level below is looked at only
 * where the view above is open); every other texel reads as art.
 */
export function artCells(art: LevelArt, placement: MapStretch, opensArt: boolean, grid: StackGrid, area?: TexelBox): ArtCells {
  const alpha = opensArt && art.alpha ? art.alpha : SOLID;
  const sums = opaqueSums(alpha);
  const stride = alpha.width + 1;
  const { columns, rows, texel } = grid;
  // World to overview pixels is affine: its origin and its steps per texel along a row and down a column.
  const size = { width: art.width, height: art.height };
  const toPixel = (x: number, y: number): { u: number; v: number } => {
    const image = worldToImage({ x, y }, size, placement);
    return { u: (image.x * alpha.width) / art.width, v: (image.y * alpha.height) / art.height };
  };
  const origin = toPixel(0, 0);
  const across = toPixel(texel, 0);
  const down = toPixel(0, texel);
  const [au, av] = [across.u - origin.u, across.v - origin.v];
  const [du, dv] = [down.u - origin.u, down.v - origin.v];
  // A square's least and greatest corner, from its first corner.
  const [lowU, highU] = [Math.min(0, au) + Math.min(0, du), Math.max(0, au) + Math.max(0, du)];
  const [lowV, highV] = [Math.min(0, av) + Math.min(0, dv), Math.max(0, av) + Math.max(0, dv)];
  /** 0: art touches the texel; 1: the image without art; 2: outside the image. */
  const state = new Uint8Array(columns * rows);
  const lastU = alpha.width - 1;
  const lastV = alpha.height - 1;
  // The area and the texels around it, which its shrink reads.
  const region = area ? grown(area, columns, rows) : { x: 0, y: 0, columns, rows };
  for (let row = region.y; row < region.y + region.rows; row++) {
    const rowU = origin.u + row * du;
    const rowV = origin.v + row * dv;
    const from = row * columns;
    for (let column = region.x; column < region.x + region.columns; column++) {
      const u = rowU + column * au;
      const v = rowV + column * av;
      const u0 = Math.floor(u + lowU - TOUCH);
      const u1 = Math.floor(u + highU + TOUCH);
      const v0 = Math.floor(v + lowV - TOUCH);
      const v1 = Math.floor(v + highV + TOUCH);
      if (u1 < 0 || v1 < 0 || u0 > lastU || v0 > lastV) {
        state[from + column] = 2;
        continue;
      }
      const c0 = u0 < 0 ? 0 : u0;
      const c1 = u1 > lastU ? lastU : u1;
      const top = (v0 < 0 ? 0 : v0) * stride;
      const bottom = ((v1 > lastV ? lastV : v1) + 1) * stride;
      const count = sums[bottom + c1 + 1]! - sums[top + c1 + 1]! - sums[bottom + c0]! + sums[top + c0]!;
      state[from + column] = count === 0 ? 1 : 0;
    }
  }
  return shrunk(state, columns, rows, area ?? region);
}

/** `area` one texel wider all round, within the grid. */
function grown(area: TexelBox, columns: number, rows: number): TexelBox {
  const x = Math.max(0, area.x - 1);
  const y = Math.max(0, area.y - 1);
  return { x, y, columns: Math.min(columns, area.x + area.columns + 1) - x, rows: Math.min(rows, area.y + area.rows + 1) - y };
}

/** Counts of opaque pixels from the overview's corner (a summed-area table), one row and column wider. */
function opaqueSums({ width, height, opaque }: ArtAlpha): Int32Array {
  const stride = width + 1;
  const sums = new Int32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let line = 0;
    const from = y * width;
    for (let x = 0; x < width; x++) {
      line += opaque[from + x]!;
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1]! + line;
    }
  }
  return sums;
}

/**
 * The open texels of `area`: those outside the image, and those of the image without art whose
 * eight neighbours hold no art either. A neighbour off the grid holds none.
 */
function shrunk(state: Uint8Array, columns: number, rows: number, area: TexelBox): ArtCells {
  // Art, grown by one texel along rows, then along columns.
  const across = new Uint8Array(state.length);
  const region = grown(area, columns, rows);
  for (let row = region.y; row < region.y + region.rows; row++) {
    const from = row * columns;
    for (let column = region.x; column < region.x + region.columns; column++) {
      const i = from + column;
      across[i] = state[i] === 0 || (column > 0 && state[i - 1] === 0) || (column + 1 < columns && state[i + 1] === 0) ? 1 : 0;
    }
  }
  const open = new Uint8Array(state.length);
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let row = area.y; row < area.y + area.rows; row++) {
    const from = row * columns;
    for (let column = area.x; column < area.x + area.columns; column++) {
      const i = from + column;
      const near = across[i] || (row > 0 && across[i - columns]) || (row + 1 < rows && across[i + columns]);
      if (state[i] !== 2 && near) continue;
      open[i] = 1;
      if (column < minX) minX = column;
      if (column > maxX) maxX = column;
      if (row < minY) minY = row;
      maxY = row;
    }
  }
  return { open, box: minX === Infinity ? null : { x: minX, y: minY, columns: maxX - minX + 1, rows: maxY - minY + 1 } };
}
