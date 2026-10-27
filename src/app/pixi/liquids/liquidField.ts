/**
 * How far each point of a liquid surface lies from its shore, as a small texture the shader reads:
 * the surface's edge fades out there (so no pixel of it is drawn hard against the map), water grows
 * deeper and lava hotter away from it. Worked out once per surface on the CPU at a few texels per
 * grid cell: exact round the shore, within a small part of a texel inside.
 */

import type { Point } from '../../types/visionTypes';

/** Texels per grid cell, where the surface is small enough for it. */
const TEXELS_PER_CELL = 8;
/** The longest side a field may have, in texels; a larger surface gets coarser texels. */
export const MAX_FIELD_SIDE = 512;
/** How far inside the shore the far channel still tells distances apart, in cells; deeper is all one. */
export const FAR_RANGE_CELLS = 3;
/** How far inside the shore the near channel reaches, in cells: it holds the edge's fade at fine steps. */
export const NEAR_RANGE_CELLS = 0.5;
/** Texels of margin outside the shore, so filtering at the edge reads real outside distances. */
const MARGIN_TEXELS = 2;

/**
 * A surface's distance field: texel (i, j) holds the distance of the world point
 * `origin + (i + 0.5, j + 0.5) * texel` from the shore, signed (positive inside), in two channels
 * of an `rgba8unorm` texture: red from `-outside` to `near` cells, green from 0 to `far` cells.
 */
export interface LiquidField {
  texels: Uint8Array;
  width: number;
  height: number;
  /** World point of the field's top left corner. */
  origin: Point;
  /** World pixels per texel. */
  texel: number;
  /** Cells the red channel reaches outside the shore and inside it, and the green inside it. */
  outside: number;
  near: number;
  far: number;
}

interface Edge { ax: number; ay: number; bx: number; by: number }

/** Texels round the shore whose distance is measured exactly; the rest is carried on from them. */
const SEED_TEXELS = 2;

/** Where the nearest point of the shore lies for each texel, and how far it is (Infinity where none is known yet). */
interface Nearest { x: Float64Array; y: Float64Array; distance: Float64Array }

/** Measures the texels within `SEED_TEXELS` of each edge exactly, keeping the nearest point of any edge. */
function seedShore(edges: readonly Edge[], width: number, height: number, origin: Point, texel: number): Nearest {
  const count = width * height;
  const nearest: Nearest = { x: new Float64Array(count), y: new Float64Array(count), distance: new Float64Array(count).fill(Infinity) };
  const band = SEED_TEXELS * texel;
  for (const edge of edges) {
    const dx = edge.bx - edge.ax;
    const dy = edge.by - edge.ay;
    const lengthSquared = dx * dx + dy * dy;
    const i0 = Math.max(0, Math.floor((Math.min(edge.ax, edge.bx) - band - origin.x) / texel));
    const i1 = Math.min(width - 1, Math.ceil((Math.max(edge.ax, edge.bx) + band - origin.x) / texel));
    const j0 = Math.max(0, Math.floor((Math.min(edge.ay, edge.by) - band - origin.y) / texel));
    const j1 = Math.min(height - 1, Math.ceil((Math.max(edge.ay, edge.by) + band - origin.y) / texel));
    for (let j = j0; j <= j1; j++) {
      const py = origin.y + (j + 0.5) * texel;
      for (let i = i0; i <= i1; i++) {
        const px = origin.x + (i + 0.5) * texel;
        const t = lengthSquared > 0 ? Math.min(1, Math.max(0, ((px - edge.ax) * dx + (py - edge.ay) * dy) / lengthSquared)) : 0;
        const cx = edge.ax + dx * t;
        const cy = edge.ay + dy * t;
        const distance = Math.hypot(px - cx, py - cy);
        const index = j * width + i;
        if (distance <= band && distance < nearest.distance[index]!) {
          nearest.distance[index] = distance;
          nearest.x[index] = cx;
          nearest.y[index] = cy;
        }
      }
    }
  }
  return nearest;
}

/**
 * Carries the nearest shore points on from texel to texel, forwards and back (dead reckoning,
 * Grevera 2004): each texel takes a neighbour's nearest point where that lies nearer to it. Exact
 * along straight shores and within a small part of a texel elsewhere, in time linear in the texels.
 */
function carryOn(nearest: Nearest, width: number, height: number, origin: Point, texel: number): void {
  const { x, y, distance } = nearest;
  const visit = (i: number, j: number, ni: number, nj: number): void => {
    if (ni < 0 || nj < 0 || ni >= width || nj >= height) return;
    const from = nj * width + ni;
    if (distance[from] === Infinity) return;
    const index = j * width + i;
    const d = Math.hypot(origin.x + (i + 0.5) * texel - x[from]!, origin.y + (j + 0.5) * texel - y[from]!);
    if (d < distance[index]!) {
      distance[index] = d;
      x[index] = x[from]!;
      y[index] = y[from]!;
    }
  };
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      visit(i, j, i - 1, j - 1);
      visit(i, j, i, j - 1);
      visit(i, j, i + 1, j - 1);
      visit(i, j, i - 1, j);
    }
  }
  for (let j = height - 1; j >= 0; j--) {
    for (let i = width - 1; i >= 0; i--) {
      visit(i, j, i + 1, j);
      visit(i, j, i - 1, j + 1);
      visit(i, j, i, j + 1);
      visit(i, j, i + 1, j + 1);
    }
  }
}

/** Per row of texel centres, which texels lie inside the polygon (even-odd, as a shoreline that crosses itself is drawn). */
function insideRows(edges: readonly Edge[], width: number, height: number, origin: Point, texel: number): Uint8Array {
  const inside = new Uint8Array(width * height);
  const crossings: number[] = [];
  for (let j = 0; j < height; j++) {
    const y = origin.y + (j + 0.5) * texel;
    crossings.length = 0;
    for (const edge of edges) {
      if ((edge.ay <= y) === (edge.by <= y)) continue;
      crossings.push(edge.ax + ((y - edge.ay) / (edge.by - edge.ay)) * (edge.bx - edge.ax));
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil((crossings[k]! - origin.x) / texel - 0.5));
      const to = Math.min(width - 1, Math.floor((crossings[k + 1]! - origin.x) / texel - 0.5));
      for (let i = from; i <= to; i++) inside[j * width + i] = 1;
    }
  }
  return inside;
}

/**
 * The distance field of `polygon` (world pixels) with `holes` cut from it, on a grid of `cell`
 * world pixels: measured exactly round the shore and carried on from there, so the work grows with
 * the surface's area and its shore, never with their product.
 */
export function liquidField(polygon: readonly Point[], cell: number, holes: readonly (readonly Point[])[] = []): LiquidField {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const texel = Math.max(cell / TEXELS_PER_CELL, span / (MAX_FIELD_SIDE - 2 * MARGIN_TEXELS - 1), 1e-3);
  const outside = Math.max(MARGIN_TEXELS * texel, cell * 0.1) / cell;
  const origin = { x: minX - MARGIN_TEXELS * texel, y: minY - MARGIN_TEXELS * texel };
  const width = Math.ceil((maxX - minX) / texel) + 2 * MARGIN_TEXELS + 1;
  const height = Math.ceil((maxY - minY) / texel) + 2 * MARGIN_TEXELS + 1;

  const edges: Edge[] = [polygon, ...holes].flatMap((ring) => ring.map((a, index) => {
    const b = ring[(index + 1) % ring.length]!;
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
  }));
  const inside = insideRows(edges, width, height, origin, texel);

  const nearest = seedShore(edges, width, height, origin, texel);
  carryOn(nearest, width, height, origin, texel);

  const texels = new Uint8Array(width * height * 4);
  const nearSpan = outside + NEAR_RANGE_CELLS;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const index = j * width + i;
      const away = Math.min(nearest.distance[index]!, FAR_RANGE_CELLS * cell);
      const cells = (inside[index] ? away : -away) / cell;
      const at = index * 4;
      texels[at] = Math.round(Math.min(1, Math.max(0, (cells + outside) / nearSpan)) * 255);
      texels[at + 1] = Math.round(Math.min(1, Math.max(0, cells / FAR_RANGE_CELLS)) * 255);
      texels[at + 3] = 255;
    }
  }
  return { texels, width, height, origin, texel, outside, near: NEAR_RANGE_CELLS, far: FAR_RANGE_CELLS };
}

/** The distance in cells a field holds at its texel (i, j), as the shader decodes it (without filtering). */
export function fieldDistance(field: LiquidField, i: number, j: number): number {
  const at = (j * field.width + i) * 4;
  const near = (field.texels[at]! / 255) * (field.outside + field.near) - field.outside;
  const far = (field.texels[at + 1]! / 255) * field.far;
  return near < field.near * 0.98 ? near : Math.max(near, far);
}
