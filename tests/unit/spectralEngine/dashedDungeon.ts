import type { GrayImage } from '../../../src/app/pixi/spectralEngine/grayImage';
import type { PixelRect } from '../../../src/app/pixi/mosaicCanvas/pyramid';
import { rng } from './fixtures';

/** Any part of a map, read at `scale` image pixels per map pixel. */
export type MapDrawing = (rect: PixelRect, scale: number) => GrayImage;

const FLOOR = 223;
const ROCK = 165;
const WALL = 40;
/** Wall strokes outside the floors, in map pixels. */
const WALL_WIDTH = 22;
/** How far the walls' shadow reaches onto the floor. */
const SHADOW = 40;
const DASH_INK = 140;
const DASH_LENGTH = 16;
const DASH_WIDTH = 10;

/** Share of `d` (distance to a shape's middle line) a shape `half` wide covers in a pixel. */
function cover(d: number, half: number): number {
  return Math.max(0, Math.min(1, half + 0.5 - d));
}

/** Distance from `value` to the nearest multiple of `period`. */
function offPeriod(value: number, period: number): number {
  const m = ((value % period) + period) % period;
  return Math.min(m, period - m);
}

/**
 * A dungeon as Atlas' generator draws it: rooms of pale floor in thick walls on grainy rock, and on
 * the floors alone a grid of `cell` px whose lines are short dashes every `pitch` px. Rooms are whole
 * cells, their walls outside the grid's lines, and the walls cast a shadow onto the floor.
 */
export function dashedDungeon(width: number, height: number, cell: number, pitch: number): MapDrawing {
  const random = rng(5);
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const floor = new Uint8Array(cols * rows);
  for (let room = 0; room < 12; room++) {
    const w = 2 + Math.floor(random() * 5);
    const h = 2 + Math.floor(random() * 4);
    const c = 1 + Math.floor(random() * (cols - w - 2));
    const r = 1 + Math.floor(random() * (rows - h - 2));
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) floor[y * cols + x] = 1;
  }
  const isFloor = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < cols && r < rows && floor[r * cols + c] === 1;

  /** The map's grey at (`x`, `y`); `fine` where the picture shows single pixels of the map. */
  const shade = (x: number, y: number, fine: boolean): number => {
    const c = Math.floor(x / cell);
    const r = Math.floor(y / cell);
    const left = x - c * cell;
    const top = y - r * cell;
    const sides: Array<[number, number, number]> = [[-1, 0, left], [1, 0, cell - left], [0, -1, top], [0, 1, cell - top]];
    if (isFloor(c, r)) {
      const shadow = Math.max(0, ...sides.filter(([dc, dr]) => !isFloor(c + dc, r + dr)).map(([, , d]) => 1 - d / SHADOW));
      const dash = Math.max(
        cover(offPeriod(x, cell), DASH_WIDTH / 2) * cover(offPeriod(y, pitch), DASH_LENGTH / 2),
        cover(offPeriod(y, cell), DASH_WIDTH / 2) * cover(offPeriod(x, pitch), DASH_LENGTH / 2),
      );
      return (FLOOR - 30 * shadow) * (1 - dash) + DASH_INK * dash;
    }
    // How far the cell `step` cells over lies along one axis, from a point `along` into this cell.
    const away = (step: number, along: number): number => (step < 0 ? along : step > 0 ? cell - along : 0);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (isFloor(c + dc, r + dr) && Math.max(away(dc, left), away(dr, top)) < WALL_WIDTH) return WALL;
      }
    }
    // The rock's dither: every other row alternates by a grey level or two, pixel by pixel. A reduced picture averages it away.
    if (!fine) return ROCK + 0.625;
    return Math.floor(y) % 2 === 1 ? ROCK + 1 : ROCK + (Math.floor(x) % 2 === 1 ? 1 : -0.5);
  };

  return (rect, scale) => {
    const w = Math.round(rect.width * scale);
    const h = Math.round(rect.height * scale);
    // A reduced picture averages the map under each of its pixels, as a browser's downscale does.
    const fine = scale >= 1;
    const n = fine ? 1 : 3;
    const data = new Float32Array(w * h);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        let sum = 0;
        for (let sy = 0; sy < n; sy++) for (let sx = 0; sx < n; sx++) sum += shade(rect.x + (px + (sx + 0.5) / n) / scale, rect.y + (py + (sy + 0.5) / n) / scale, fine);
        data[py * w + px] = sum / (n * n);
      }
    }
    return { width: w, height: h, data };
  };
}
