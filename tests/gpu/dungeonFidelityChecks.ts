import { doorCells, holdsCell } from '../../src/app/dungeons/geometry';
import type { DungeonFloor } from '../../src/app/dungeons/model';
import type { DungeonPlacement } from '../../src/app/dungeons/scene/toWalls';
import type { FloorField } from '../../src/app/dungeons/render/visibleDungeon';
import type { Rgb } from '../../src/app/dungeons/render/palette';
import type { GridState } from '../../src/app/types/gridTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';

/**
 * Measurements of a scene against the map image it was written for: whether its walls lie on the
 * drawn walls, whether every drawn wall has a wall, and whether its grid is the drawn grid.
 */

interface Point {
  x: number;
  y: number;
}

export interface Picture {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const near = (data: Uint8ClampedArray, i: number, [r, g, b]: Rgb, tolerance: number): boolean =>
  Math.abs(data[i]! - r) + Math.abs(data[i + 1]! - g) + Math.abs(data[i + 2]! - b) < tolerance;

/** Which pixels are the style's ink. */
export function inkMask(picture: Picture, ink: Rgb): Uint8Array {
  const mask = new Uint8Array(picture.width * picture.height);
  for (let p = 0; p < mask.length; p++) mask[p] = near(picture.data, p * 4, ink, 90) ? 1 : 0;
  return mask;
}

export function nearestInk(mask: Uint8Array, picture: Picture, p: Point, reach: number): number {
  let best = Infinity;
  const cx = Math.round(p.x);
  const cy = Math.round(p.y);
  for (let y = cy - reach; y <= cy + reach; y++) {
    if (y < 0 || y >= picture.height) continue;
    for (let x = cx - reach; x <= cx + reach; x++) {
      if (x < 0 || x >= picture.width || !mask[y * picture.width + x]) continue;
      best = Math.min(best, Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y));
    }
  }
  return best;
}

/** How far each point along the walls (every 4 px) lies from drawn ink, in pixels; Infinity beyond 8 px. */
export function wallsOnInk(walls: readonly WallSegment[], mask: Uint8Array, picture: Picture): { distance: number; at: Point }[] {
  return walls.flatMap(({ p1, p2 }) => {
    const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(1, Math.round(length / 4));
    return Array.from({ length: steps + 1 }, (_, k) => {
      const at = { x: p1.x + ((p2.x - p1.x) * k) / steps, y: p1.y + ((p2.y - p1.y) * k) / steps };
      return { distance: nearestInk(mask, picture, at, 8), at };
    });
  });
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t);
}

/** Walls by the 100 px tile they pass, for nearest-wall questions. */
function wallIndex(walls: readonly WallSegment[]): (p: Point) => number {
  const tiles = new Map<string, WallSegment[]>();
  for (const wall of walls) {
    for (let ty = Math.floor(Math.min(wall.p1.y, wall.p2.y) / 100) - 1; ty <= Math.floor(Math.max(wall.p1.y, wall.p2.y) / 100) + 1; ty++) {
      for (let tx = Math.floor(Math.min(wall.p1.x, wall.p2.x) / 100) - 1; tx <= Math.floor(Math.max(wall.p1.x, wall.p2.x) / 100) + 1; tx++) {
        tiles.set(`${tx},${ty}`, [...(tiles.get(`${tx},${ty}`) ?? []), wall]);
      }
    }
  }
  return p => Math.min(Infinity, ...(tiles.get(`${Math.floor(p.x / 100)},${Math.floor(p.y / 100)}`) ?? []).map(w => segmentDistance(p, w.p1, w.p2)));
}

/**
 * Floor pixels that touch drawn ink at the floor's edge (the drawn wall's inner face), and how far
 * each lies from the nearest wall of the scene, in pixels; door cells and stairwells left out.
 */
export function inkEdgesFromWalls(
  floor: DungeonFloor,
  field: FloorField,
  walls: readonly WallSegment[],
  mask: Uint8Array,
  picture: Picture,
  placement: DungeonPlacement,
): { distance: number; at: Point }[] {
  const { originCell, pxPerCell } = placement;
  const cellOf = (x: number, y: number): Point => ({ x: x / pxPerCell + originCell.x, y: y / pxPerCell + originCell.y });
  const inRect = (c: Point, x: number, y: number, w: number, h: number, grow: number): boolean =>
    c.x >= x - grow && c.x <= x + w + grow && c.y >= y - grow && c.y <= y + h + grow;
  // A door on an edge stands between its cell and the one across; a window's jambs and pane are ink in its outer wall.
  const doorways = floor.doors.flatMap(d => doorCells(d).flatMap(cell => (d.edge ? [cell, { x: cell.x + d.dir.x, y: cell.y + d.dir.y }] : [cell])));
  const excluded = (c: Point): boolean =>
    doorways.some(cell => inRect(c, cell.x, cell.y, 1, 1, 0.05)) || (floor.windows ?? []).some(w => inRect(c, w.x, w.y, 1, 1, 0.2)) || floor.stairs.some(s => inRect(c, s.x, s.y, s.w, s.h, 0.1));
  const nearest = wallIndex(walls);
  const out: { distance: number; at: Point }[] = [];
  const { width, height } = picture;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      if (mask[p] || !(mask[p - 1] || mask[p + 1] || mask[p - width] || mask[p + width])) continue;
      const c = cellOf(x + 0.5, y + 0.5);
      const d = field.distance(c.x, c.y);
      if (d > 0.0025 || d < -0.015 || excluded(c)) continue;
      out.push({ distance: nearest({ x: x + 0.5, y: y + 0.5 }), at: { x, y } });
    }
  }
  return out;
}

/**
 * Pixels of the grid's colour on the scene grid's lines and halfway between them, inside the
 * rooms (clear of their walls and stairwells): a scene grid that is the drawn one finds its lines
 * on the first and none on the second.
 */
export function gridAgreement(floor: DungeonFloor, grid: Pick<GridState, 'size' | 'offsetX' | 'offsetY'>, picture: Picture, placement: DungeonPlacement, colours: { grid: Rgb; floor: Rgb }): { on: number; off: number } {
  const { originCell, pxPerCell } = placement;
  // Terrain covers the grid where it lies, a little beyond its cells (shadows, a bridge's ends), and a
  // column's hatching and a piece (a fireplace, a bust) lie on the cells round them: all are left out, as they are drawn over the grid.
  const around = (x: number, y: number): string[] => [-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dy => `${x + dx},${y + dy}`));
  const terrain = new Set([...floor.terrain.flatMap(piece => piece.cells.flatMap(c => around(c.x, c.y))), ...[...floor.columns, ...floor.props].flatMap(c => around(Math.floor(c.x), Math.floor(c.y)))]);
  const gridLike = (x: number, y: number): boolean => {
    if (terrain.has(`${Math.floor(x / pxPerCell + originCell.x)},${Math.floor(y / pxPerCell + originCell.y)}`)) return false;
    const i = (Math.floor(y) * picture.width + Math.floor(x)) * 4;
    const d = picture.data;
    const toGrid = Math.abs(d[i]! - colours.grid[0]) + Math.abs(d[i + 1]! - colours.grid[1]) + Math.abs(d[i + 2]! - colours.grid[2]);
    const toFloor = Math.abs(d[i]! - colours.floor[0]) + Math.abs(d[i + 1]! - colours.floor[1]) + Math.abs(d[i + 2]! - colours.floor[2]);
    return toGrid < toFloor && toGrid < 60;
  };
  let on = 0;
  let off = 0;
  for (const room of floor.rooms.filter(r => r.kind === 'room' && !r.rotunda && !floor.stairs.some(s => s.x >= r.x && s.x < r.x + r.w && s.y >= r.y && s.y < r.y + r.h))) {
    // A room terrain fills half of has too few grid lines left to count.
    const x0 = (room.x + 0.3 - originCell.x) * pxPerCell;
    const x1 = (room.x + room.w - 0.3 - originCell.x) * pxPerCell;
    const y0 = (room.y + 0.3 - originCell.y) * pxPerCell;
    const y1 = (room.y + room.h - 0.3 - originCell.y) * pxPerCell;
    // A cave room's rectangle holds rock beside its cells, which is no floor for a grid line to cross.
    const onFloor = (x: number, y: number): boolean => holdsCell(room, Math.floor(x / pxPerCell + originCell.x), Math.floor(y / pxPerCell + originCell.y));
    const count = (line: number, along: [number, number], vertical: boolean): number => {
      let n = 0;
      // A line on a pixel boundary inks the pixels on both sides of it
      for (let t = along[0]; t <= along[1]; t++) {
        if (!(vertical ? onFloor(line, t) : onFloor(t, line))) continue;
        if (vertical ? gridLike(line - 1, t) || gridLike(line, t) : gridLike(t, line - 1) || gridLike(t, line)) n++;
      }
      return n;
    };
    for (let x = grid.offsetX + Math.ceil((x0 - grid.offsetX) / grid.size) * grid.size; x <= x1; x += grid.size) {
      on += count(x, [y0, y1], true);
      if (x + grid.size / 2 <= x1) off += count(x + grid.size / 2, [y0, y1], true);
    }
    for (let y = grid.offsetY + Math.ceil((y0 - grid.offsetY) / grid.size) * grid.size; y <= y1; y += grid.size) {
      on += count(y, [x0, x1], false);
      if (y + grid.size / 2 <= y1) off += count(y + grid.size / 2, [x0, x1], false);
    }
  }
  return { on, off };
}

/** Pixels where two pictures differ: what drawing something added. */
export function changedMask(a: Picture, b: Picture): Uint8Array {
  const mask = new Uint8Array(a.width * a.height);
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    mask[p] = Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!) > 30 ? 1 : 0;
  }
  return mask;
}

/**
 * Outlines whose object is not drawn out to them, by the middle of each: more than `share` of the
 * points along it (every 3 px) find, walking outward away from the outline's middle, no pixel the
 * object changed within `slack` px. An outline on its drawn object has nearly none (a line of the
 * floor's own drawing may cross the object's edge where it ends).
 */
export function outlinesOffObjects(outlines: readonly (readonly Point[])[], changed: Uint8Array, picture: Picture, slack: number, share: number): Point[] {
  const strays: Point[] = [];
  const at = (x: number, y: number): boolean => {
    const px = Math.round(x);
    const py = Math.round(y);
    return px >= 0 && py >= 0 && px < picture.width && py < picture.height && changed[py * picture.width + px] === 1;
  };
  for (const ring of outlines) {
    const centre = { x: ring.reduce((s, p) => s + p.x, 0) / ring.length, y: ring.reduce((s, p) => s + p.y, 0) / ring.length };
    let points = 0;
    let off = 0;
    ring.forEach((a, k) => {
      const b = ring[(k + 1) % ring.length]!;
      const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 3));
      for (let s = 0; s < steps; s++) {
        const p = { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps };
        const d = Math.hypot(p.x - centre.x, p.y - centre.y) || 1;
        const out = { x: (p.x - centre.x) / d, y: (p.y - centre.y) / d };
        let found = false;
        for (let t = -1; t <= slack && !found; t += 0.5) found = at(p.x + out.x * t, p.y + out.y * t);
        points++;
        if (!found) off++;
      }
    });
    if (off > points * share) strays.push(centre);
  }
  return strays;
}

/** Walls of the scene that pass through a hole or a bridge more than a hair inside its cells: there are to be none. */
export function wallsInTerrain(floor: DungeonFloor, walls: readonly WallSegment[], placement: DungeonPlacement): string[] {
  const { originCell, pxPerCell } = placement;
  const cells = new Set(floor.terrain.filter(p => p.opening || p.kind === 'bridge').flatMap(p => p.cells.map(c => `${c.x},${c.y}`)));
  const out: string[] = [];
  for (const { p1, p2 } of walls) {
    const steps = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 4));
    for (let k = 0; k <= steps; k++) {
      const x = (p1.x + ((p2.x - p1.x) * k) / steps) / pxPerCell + originCell.x;
      const y = (p1.y + ((p2.y - p1.y) * k) / steps) / pxPerCell + originCell.y;
      const fx = x - Math.floor(x);
      const fy = y - Math.floor(y);
      if (fx < 0.05 || fx > 0.95 || fy < 0.05 || fy > 0.95) continue;
      if (cells.has(`${Math.floor(x)},${Math.floor(y)}`)) {
        out.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        break;
      }
    }
  }
  return out;
}

/** The alpha of the picture at the middle of a cell. */
export function alphaAt(picture: Picture, placement: DungeonPlacement, c: Point): number {
  const x = Math.floor((c.x + 0.5 - placement.originCell.x) * placement.pxPerCell);
  const y = Math.floor((c.y + 0.5 - placement.originCell.y) * placement.pxPerCell);
  return picture.data[(y * picture.width + x) * 4 + 3] ?? 0;
}
