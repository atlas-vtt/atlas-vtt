import type { CellPoint, DungeonDoor, DungeonRoom } from '../model';
import { traceLoops } from '../water/contour';
import { cellMask } from '../water/wetGrid';
import { grownRings } from './clipShapes';
import { PolyField } from './cave/polyField';

/**
 * Floor geometry in cells. A room's floor is its rectangle, or for a rotunda the circle through
 * the inner corners of its four door cells, or for a cave's room the outline of its cells; every
 * visible door cell but a secret one is floor too.
 */

export type Vec = CellPoint;

/** A polygon's rings: the first outer, clockwise on screen, the rest holes in it, counter-clockwise. */
export type PolyShape = { kind: 'poly'; rings: Vec[][] };

export type RectShape = { kind: 'rect'; x: number; y: number; w: number; h: number };

export type FloorShape = RectShape | { kind: 'circle'; cx: number; cy: number; r: number } | PolyShape;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** What 2D drawing both a window's canvas and a worker's offscreen canvas offer. */
export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Radius of a rotunda: the circle through the inner corners of its cardinal door cells. */
export function rotundaRadius(room: Pick<DungeonRoom, 'w'>): number {
  return Math.sqrt(room.w * room.w + 1) / 2;
}

export function roomCentre(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h'>): Vec {
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

const cellShapes = new WeakMap<readonly CellPoint[], PolyShape[]>();

/** The outline of a set of cells as polygons, one per piece with its holes; the same for the same cells. */
export function cellsShapes(cells: readonly CellPoint[]): PolyShape[] {
  let shapes = cellShapes.get(cells);
  if (!shapes) {
    const { grid, marks } = cellMask(cells);
    shapes = polysOf(traceLoops(grid, marks));
    cellShapes.set(cells, shapes);
  }
  return shapes;
}

/** The outline of a set of cells as rings, holes among them. */
export function cellsRings(cells: readonly CellPoint[]): Vec[][] {
  return cells.length ? cellsShapes(cells).flatMap((shape) => shape.rings) : [];
}

/** Rings as polygons: each hole goes with the outer ring that holds its first point. */
export function polysOf(rings: readonly Vec[][]): PolyShape[] {
  const outers = rings.filter((ring) => signedArea2(ring) > 0);
  const shapes: PolyShape[] = outers.map((ring) => ({ kind: 'poly', rings: [ring] }));
  for (const hole of rings.filter((ring) => signedArea2(ring) < 0)) {
    const first = hole[0]!;
    const owner = shapes.find((_, k) => pointInPolygon(outers[k]!, first.x, first.y));
    owner?.rings.push(hole);
  }
  return shapes;
}

export function roomShape(room: DungeonRoom): FloorShape {
  if (room.cells) return cellsShapes(room.cells)[0] ?? { kind: 'rect', x: room.x, y: room.y, w: 0, h: 0 };
  if (!room.rotunda) return { kind: 'rect', x: room.x, y: room.y, w: room.w, h: room.h };
  const c = roomCentre(room);
  return { kind: 'circle', cx: c.x, cy: c.y, r: rotundaRadius(room) };
}

/** A door's cell, or both cells of an opening two cells wide (`DungeonDoor.wide`). */
export function doorShape(door: Pick<DungeonDoor, 'x' | 'y' | 'wide'>): RectShape {
  const { x, y, wide } = door;
  if (!wide) return { kind: 'rect', x, y, w: 1, h: 1 };
  return { kind: 'rect', x: Math.min(x, x + wide.x), y: Math.min(y, y + wide.y), w: 1 + Math.abs(wide.x), h: 1 + Math.abs(wide.y) };
}

/** A narrow opening's width across the passage, and how deep its jambs reach along it, in cells. */
const DOORWAY_OPENING = 0.6;
const DOORWAY_DEPTH = 0.5;

/**
 * The floor of a door cell. A narrow opening's is narrowed by two wall jambs in its middle, so the
 * walls drawn around the floor step in and out of it; any other door cell is floor whole.
 */
export function doorShapes(door: Pick<DungeonDoor, 'x' | 'y' | 'dir' | 'wide'>, narrow: boolean): FloorShape[] {
  if (!narrow) return [doorShape(door)];
  const end = (1 - DOORWAY_DEPTH) / 2;
  const side = (1 - DOORWAY_OPENING) / 2;
  const { x, y } = door;
  if (door.dir.x !== 0) {
    return [
      { kind: 'rect', x, y, w: end, h: 1 },
      { kind: 'rect', x: x + end, y: y + side, w: DOORWAY_DEPTH, h: DOORWAY_OPENING },
      { kind: 'rect', x: x + 1 - end, y, w: end, h: 1 },
    ];
  }
  return [
    { kind: 'rect', x, y, w: 1, h: end },
    { kind: 'rect', x: x + side, y: y + end, w: DOORWAY_OPENING, h: DOORWAY_DEPTH },
    { kind: 'rect', x, y: y + 1 - end, w: 1, h: end },
  ];
}

export function shapeBounds(shape: FloorShape, grow = 0): Bounds {
  if (shape.kind === 'poly') {
    const b = pointsBounds(shape.rings[0] ?? []);
    return { minX: b.minX - grow, minY: b.minY - grow, maxX: b.maxX + grow, maxY: b.maxY + grow };
  }
  if (shape.kind === 'rect') {
    return { minX: shape.x - grow, minY: shape.y - grow, maxX: shape.x + shape.w + grow, maxY: shape.y + shape.h + grow };
  }
  const r = shape.r + grow;
  return { minX: shape.cx - r, minY: shape.cy - r, maxX: shape.cx + r, maxY: shape.cy + r };
}

export function unionBounds(boxes: readonly Bounds[]): Bounds {
  const out: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const b of boxes) {
    out.minX = Math.min(out.minX, b.minX);
    out.minY = Math.min(out.minY, b.minY);
    out.maxX = Math.max(out.maxX, b.maxX);
    out.maxY = Math.max(out.maxY, b.maxY);
  }
  return out;
}

/** The bounding box of a set of points. */
export function pointsBounds(points: readonly Vec[]): Bounds {
  const out: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) {
    out.minX = Math.min(out.minX, p.x);
    out.minY = Math.min(out.minY, p.y);
    out.maxX = Math.max(out.maxX, p.x);
    out.maxY = Math.max(out.maxY, p.y);
  }
  return out;
}

export function pointSegmentDistance(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

const polyFields = new WeakMap<PolyShape, PolyField>();

function polyField(shape: PolyShape): PolyField {
  let field = polyFields.get(shape);
  if (!field) {
    field = new PolyField(shape.rings);
    polyFields.set(shape, field);
  }
  return field;
}

/** Signed distance from a point to a shape's edge: negative inside. */
export function shapeDistance(shape: FloorShape, x: number, y: number): number {
  if (shape.kind === 'poly') return polyField(shape).distance(x, y);
  if (shape.kind === 'circle') return Math.hypot(x - shape.cx, y - shape.cy) - shape.r;
  const hx = shape.w / 2;
  const hy = shape.h / 2;
  const dx = Math.abs(x - (shape.x + hx)) - hx;
  const dy = Math.abs(y - (shape.y + hy)) - hy;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0);
}

/**
 * Adds a shape as a closed subpath, grown by `grow` with round corners of that radius, all
 * clockwise on screen so a nonzero fill of many shapes is their union.
 */
function traceShape(path: CanvasPath, shape: FloorShape, grow = 0, cornerRadius = grow): void {
  if (shape.kind === 'poly') {
    for (const ring of grown(shape, grow, 'round')) tracePolygon(path, ring);
    return;
  }
  if (shape.kind === 'circle') {
    path.moveTo(shape.cx + shape.r + grow, shape.cy);
    path.arc(shape.cx, shape.cy, shape.r + grow, 0, Math.PI * 2);
    path.closePath();
    return;
  }
  const x0 = shape.x - grow;
  const y0 = shape.y - grow;
  const x1 = shape.x + shape.w + grow;
  const y1 = shape.y + shape.h + grow;
  const r = Math.max(0, Math.min(cornerRadius, (x1 - x0) / 2, (y1 - y0) / 2));
  if (r === 0) {
    path.moveTo(x0, y0);
    path.lineTo(x1, y0);
    path.lineTo(x1, y1);
    path.lineTo(x0, y1);
    path.closePath();
    return;
  }
  path.moveTo(x0 + r, y0);
  path.arcTo(x1, y0, x1, y1, r);
  path.arcTo(x1, y1, x0, y1, r);
  path.arcTo(x0, y1, x0, y0, r);
  path.arcTo(x0, y0, x1, y0, r);
  path.closePath();
}

/** Adds every shape to one path. */
export function traceShapes(path: CanvasPath, shapes: readonly FloorShape[], grow = 0, cornerRadius = grow): void {
  for (const shape of shapes) traceShape(path, shape, grow, cornerRadius);
}

const grownPolys = new WeakMap<PolyShape, Map<string, Vec[][]>>();

/** A poly's rings grown by `grow` (round or square corners), kept for the next call with the same. */
function grown(shape: PolyShape, grow: number, join: 'round' | 'miter'): Vec[][] {
  if (grow === 0) return shape.rings;
  let memo = grownPolys.get(shape);
  if (!memo) {
    memo = new Map();
    grownPolys.set(shape, memo);
  }
  const key = `${join}:${grow}`;
  let rings = memo.get(key);
  if (!rings) {
    rings = grownRings(shape.rings, grow, join);
    memo.set(key, rings);
  }
  return rings;
}

/**
 * A shape's rings grown by `grow`, as the clipping helpers take them: outer rings clockwise on
 * screen, holes counter-clockwise; circles get enough corners for `pxPerCell`, a poly's corners
 * stay square where it grows, as a rectangle's do.
 */
export function shapeRings(shape: FloorShape, grow = 0, pxPerCell = 100): Vec[][] {
  return shape.kind === 'poly' ? grown(shape, grow, 'miter') : [shapePolygon(shape, grow, pxPerCell)];
}

/** A rectangle or circle as a polygon (clockwise on screen); circles get enough corners for `pxPerCell`. */
export function shapePolygon(shape: Exclude<FloorShape, PolyShape>, grow = 0, pxPerCell = 100): Vec[] {
  if (shape.kind === 'rect') {
    const { minX, minY, maxX, maxY } = shapeBounds(shape, grow);
    return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
  }
  const r = shape.r + grow;
  const n = Math.max(32, Math.min(512, Math.ceil((Math.PI * 2 * r * pxPerCell) / 4)));
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: shape.cx + Math.cos(a) * r, y: shape.cy + Math.sin(a) * r });
  }
  return out;
}

export function tracePolygon(path: CanvasPath, points: readonly Vec[]): void {
  const first = points[0];
  if (!first) return;
  path.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) path.lineTo(points[i]!.x, points[i]!.y);
  path.closePath();
}

/** Twice the signed area; positive when clockwise on screen (y down). */
export function signedArea2(points: readonly Vec[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

/** The way round of the largest of `rings`: the outline whose holes run the other way, so every ring keeps what it bounds on one side. */
export function outerTurn(rings: readonly (readonly Vec[])[]): number {
  let largest = 0;
  for (const ring of rings) {
    const area = signedArea2(ring);
    if (Math.abs(area) > Math.abs(largest)) largest = area;
  }
  return Math.sign(largest);
}

export function pointInPolygon(points: readonly Vec[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function rotate(v: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** The closed curve `traceSmoothClosed` draws through `points`, as points `steps` to a corner. */
export function smoothClosedPoints(points: readonly Vec[], steps: number): Vec[] {
  const n = points.length;
  const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const from = mid(points[(i + n - 1) % n]!, points[i]!);
    const control = points[i]!;
    const to = mid(control, points[(i + 1) % n]!);
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push({ x: u * u * from.x + 2 * u * t * control.x + t * t * to.x, y: u * u * from.y + 2 * u * t * control.y + t * t * to.y });
    }
  }
  return out;
}

/** A closed curve through the midpoints of a polygon's edges, its corners as control points. */
export function traceSmoothClosed(path: CanvasPath, points: readonly Vec[]): void {
  const n = points.length;
  if (n < 3) return;
  const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(points[n - 1]!, points[0]!);
  path.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const m = mid(p, points[(i + 1) % n]!);
    path.quadraticCurveTo(p.x, p.y, m.x, m.y);
  }
  path.closePath();
}
