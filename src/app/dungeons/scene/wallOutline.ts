import { doorAnchor } from '../geometry';
import type { CellDir, DungeonDoor } from '../model';
import { unionRings } from '../render/clipShapes';
import { doorShape, shapePolygon, shapeRings, type FloorShape, type Vec } from '../render/geometry';

/**
 * The centre line of a dungeon's drawn walls, in cells. The renderer strokes every floor shape at
 * twice the wall width and fills the floors over it, so the ink lies outside the union of the
 * floors, one wall width wide; its centre line is that union grown by half the wall width. Growing
 * each shape before the union gives the same outline, with square corners where the ink has round
 * ones (the corner still lies inside the ink). The shapes are the renderer's own (`visibleFloor`),
 * jambs of narrow openings included, so the walls follow exactly what is drawn.
 *
 * The union runs on the clipping helpers' grid of 1/1024 cell, so every corner is a whole number
 * of grid steps and lines along the grid meet the outline exactly.
 */

/** Grid steps per cell, as `unionRings` rounds them. */
export const STEPS = 1024;
/** A rotunda's wall is a polygon of this many sides. */
const ROTUNDA_SIDES = 64;

const snap = (cells: number): number => Math.round(cells * STEPS) / STEPS;

/** A shape's wall rings grown by `grow`: a poly's every ring, the corners square as a rectangle's. */
function ringsOf(shape: FloorShape, grow: number): Vec[][] {
  if (shape.kind !== 'poly') return [ringOf(shape, grow)];
  return shapeRings(shape, grow).map(ring => ring.map(p => ({ x: snap(p.x), y: snap(p.y) })));
}

function ringOf(shape: Exclude<FloorShape, { kind: 'poly' }>, grow: number): Vec[] {
  if (shape.kind === 'rect') return shapePolygon(shape, grow).map(p => ({ x: snap(p.x), y: snap(p.y) }));
  const r = shape.r + grow;
  const ring: Vec[] = [];
  for (let i = 0; i < ROTUNDA_SIDES; i++) {
    const a = (i / ROTUNDA_SIDES) * Math.PI * 2;
    ring.push({ x: snap(shape.cx + Math.cos(a) * r), y: snap(shape.cy + Math.sin(a) * r) });
  }
  return ring;
}

/**
 * The wall rings around the drawn floors, each grown by `grow` cells, and around every secret
 * door's cell, which the map draws as wall: it becomes a short passage closed by the secret door.
 * Outer outlines and the outlines of rock enclosed by rooms alike.
 */
export function wallRings(floors: readonly FloorShape[], secretDoors: readonly DungeonDoor[], grow: number): Vec[][] {
  const g = snap(grow);
  return unionRings([...floors.flatMap(shape => ringsOf(shape, g)), ...secretDoors.map(door => ringOf(doorShape(door), g))]);
}

/** A line across a door cell: through `at`, along the door's width (perpendicular to its direction). */
export interface DoorLine {
  at: Vec;
  across: Vec;
}

/**
 * The line across a door cell `v` cells from its middle along the door's direction (towards the
 * child room), snapped to the grid like the rings.
 */
export function doorLine(door: Pick<DungeonDoor, 'x' | 'y' | 'wide' | 'edge'> & { dir: CellDir }, v: number): DoorLine {
  const s = snap(v);
  // A door on an edge stands across its edge's middle, which lies on the snapping grid.
  const base = doorAnchor(door);
  return {
    at: { x: base.x + door.dir.x * s, y: base.y + door.dir.y * s },
    across: { x: -door.dir.y, y: door.dir.x },
  };
}

/** Where a line meets a ring: the edge (from corner `edge` to the next), how far along it, and where. */
export interface RingHit {
  ring: number;
  edge: number;
  /** 0 at the edge's start, 1 at its end. */
  along: number;
  /** Distance from the line's point along `across`, in cells (negative on the other side). */
  t: number;
  point: Vec;
}

const EPS = 1e-9;

export function hitsOnRing(rings: readonly Vec[][], ringIndex: number, line: DoorLine, out: RingHit[]): void {
  const ring = rings[ringIndex]!;
  const { at, across } = line;
  for (let edge = 0; edge < ring.length; edge++) {
    const a = ring[edge]!;
    const b = ring[(edge + 1) % ring.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = across.x * ey - across.y * ex;
    if (Math.abs(denom) < EPS) continue;
    const dx = a.x - at.x;
    const dy = a.y - at.y;
    const t = (dx * ey - dy * ex) / denom;
    const along = (dx * across.y - dy * across.x) / denom;
    if (along < -EPS || along > 1 + EPS) continue;
    const point = along <= EPS ? a : along >= 1 - EPS ? b : { x: at.x + across.x * t, y: at.y + across.y * t };
    out.push({ ring: ringIndex, edge, along: Math.min(1, Math.max(0, along)), t, point });
  }
}

/**
 * The two places a door line meets the wall rings nearest to its point, one on each side, or null
 * when either is farther than `reach` cells: the line does not lie between two walls there.
 */
export function doorEnds(rings: readonly Vec[][], line: DoorLine, reach: number): [RingHit, RingHit] | null {
  const hits: RingHit[] = [];
  for (let ring = 0; ring < rings.length; ring++) hitsOnRing(rings, ring, line, hits);
  let before: RingHit | null = null;
  let after: RingHit | null = null;
  for (const hit of hits) {
    if (hit.t < 0 && (!before || hit.t > before.t)) before = hit;
    if (hit.t > 0 && (!after || hit.t < after.t)) after = hit;
  }
  if (!before || !after || -before.t > reach || after.t > reach) return null;
  return [before, after];
}

/** The rings with every hit's point made a corner of its edge, so a door ends exactly where a wall does. */
export function splitRings(rings: readonly Vec[][], hits: readonly RingHit[]): Vec[][] {
  const byEdge = new Map<string, RingHit[]>();
  for (const hit of hits) {
    if (hit.along <= EPS || hit.along >= 1 - EPS) continue;
    const key = `${hit.ring}:${hit.edge}`;
    byEdge.set(key, [...(byEdge.get(key) ?? []), hit]);
  }
  return rings.map((ring, r) => {
    const out: Vec[] = [];
    ring.forEach((corner, edge) => {
      out.push(corner);
      const inner = (byEdge.get(`${r}:${edge}`) ?? []).sort((p, q) => p.along - q.along);
      for (const hit of inner) {
        const last = out[out.length - 1]!;
        if (last.x !== hit.point.x || last.y !== hit.point.y) out.push(hit.point);
      }
    });
    return out;
  });
}
