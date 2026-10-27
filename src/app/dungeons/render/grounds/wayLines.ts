/**
 * The ways of a house's grounds as drawn. The way in is formal: its cells as they lie, straight and
 * square on the door's axis, and where the drive turns round its fountain, a ring centred on the
 * fountain. Every other walk is one cell wide in the model, laid in straight legs; drawn, it runs
 * through its cells' middles with each turn rounded (Repton's and Brown's walks curve where they
 * turn), its width wavering a little as a hand-laid edge does, flared where it meets a door, and
 * every junction filleted, so a walk meets a way as painted maps draw it rather than as cells do.
 */

import { cellsBox } from '../../geometry';
import type { GroundsPiece } from '../../model';
import { valueNoise } from '../art/noise';
import { rectPoly } from '../art/paths';
import { subtractRings, unionRings } from '../clipShapes';
import { cellsRings, signedArea2, type Vec } from '../geometry';
import { circle } from '../terrain/cover';
import { circleFillet, squareFillet } from './wayJoins';

/** A walk's half width, how far it wavers either way, and over how long a stretch its waver turns. */
const WALK = { half: 0.5, waver: 0.035, stretch: 1.6 };
/** The longest a turn's rounding reaches along either leg, in cells: a turn of a quarter rounded to this radius. */
const TURN_REACH = 1.25;
/** How far along a curve the drawn line steps, in cells. */
const CURVE_STEP = 0.2;
/** The rounding where ways meet, and where a walk flares against a door's wall: the fillet's radius, in cells. */
const FILLET = { way: 0.3, door: 0.4 };
/** The turning circle round its island: the island's edge in from its cells', the circle's edge in from its cells'. */
const SWEEP_INSET = { island: 0.1, outer: 0.04 };

export interface WayShapes {
  /** The ways' ground as rings. */
  rings: Vec[][];
  /** The cells the ground covers, for what is scattered over it. */
  cells: Vec[];
}

/** The drive's turning circle: its centre, its island's radius and its outer radius, from the fountain's island of cells. */
export function sweepOf(fountain: GroundsPiece | undefined): { centre: Vec; inner: number; outer: number; reach: number } | null {
  if (!fountain?.at) return null;
  const half = cellsBox(fountain.cells).w / 2;
  return { centre: fountain.at, inner: half - SWEEP_INSET.island, outer: half + 2 - SWEEP_INSET.outer, reach: half + 2 };
}

/**
 * The ways' ground: the formal way in (`formal`: the cells of the drive or front walk, the gates, a
 * garden walk wider than one cell) with its turning circle, and the walks (`walks`: one cell wide,
 * their cells in order), joined and filleted.
 */
export function wayShapes(formal: readonly Vec[], walks: readonly (readonly Vec[])[], fountain: GroundsPiece | undefined, seed: number): WayShapes {
  const sweep = sweepOf(fountain);
  const inTurn = (c: Vec): boolean => !!sweep && Math.abs(c.x + 0.5 - sweep.centre.x) < sweep.reach && Math.abs(c.y + 0.5 - sweep.centre.y) < sweep.reach;
  const ground = new Set(formal.map((c) => key(c)));
  for (const walk of walks) for (const c of walk) ground.add(key(c));
  const covered = new Set(ground);
  const shapes: Vec[][] = [...cellsRings(formal.filter((c) => !inTurn(c)))];
  if (sweep) shapes.push(circle(sweep.centre, sweep.outer, 64));
  walks.forEach((walk, k) => {
    const line = walkLine(walk, ground);
    if (!line) return;
    const ribbon = ribbonOf(line.points, seed + k * 101);
    for (const p of ribbon) covered.add(key({ x: Math.floor(p.x), y: Math.floor(p.y) }));
    shapes.push(ribbon);
    for (const end of line.ends) shapes.push(...endFillets(end, ground, sweep && inTurn(end.beyond) ? sweep : null));
  });
  if (sweep) shapes.push(...driveIntoTurn(sweep, ground));
  // One way round for every piece, or where two overlap the union would count them out.
  const joined = unionRings(shapes.map((ring) => (signedArea2(ring) < 0 ? [...ring].reverse() : ring)));
  const rings = sweep ? subtractRings(joined, [circle(sweep.centre, sweep.inner, 64)]) : joined;
  return { rings, cells: [...covered].map(unkey) };
}

const key = (c: Vec): string => `${c.x},${c.y}`;
const unkey = (k: string): Vec => {
  const [x, y] = k.split(',').map(Number) as [number, number];
  return { x, y };
};

/** Where a walk ends: the end of its middle line, the way it points there, and the cell beyond, a way's or a door's. */
interface WalkEnd {
  at: Vec;
  dir: Vec;
  beyond: Vec;
  door: boolean;
}

type Sweep = NonNullable<ReturnType<typeof sweepOf>>;

/**
 * A walk's middle line: through its cells' middles, on from each end into the way it meets (to that
 * cell's middle) or to the face of the door it leaves (half a cell).
 */
function walkLine(cells: readonly Vec[], ground: ReadonlySet<string>): { points: Vec[]; ends: WalkEnd[] } | null {
  const mid = (c: Vec): Vec => ({ x: c.x + 0.5, y: c.y + 0.5 });
  const ends: WalkEnd[] = [];
  // Which way each end leaves: along its last step, or for a walk of one cell, towards the way beside it.
  const out = (end: Vec, from: Vec | undefined): Vec | null => {
    if (from) return { x: end.x - from.x, y: end.y - from.y };
    return SIDES.find((s) => ground.has(key({ x: end.x + s.x, y: end.y + s.y }))) ?? null;
  };
  const endOf = (end: Vec, dir: Vec): Vec => {
    const beyond = { x: end.x + dir.x, y: end.y + dir.y };
    const door = !ground.has(key(beyond));
    const at = door ? { x: end.x + 0.5 + dir.x * 0.5, y: end.y + 0.5 + dir.y * 0.5 } : mid(beyond);
    ends.push({ at, dir, beyond, door });
    return at;
  };
  const first = cells[0]!;
  const last = cells[cells.length - 1]!;
  const head = out(first, cells[1]);
  if (!head) return null;
  const tail = cells.length > 1 ? out(last, cells[cells.length - 2]) : { x: -head.x, y: -head.y };
  const points = [endOf(first, head), ...cells.map(mid), endOf(last, tail!)];
  return { points: corners(points), ends };
}

/**
 * The fillets either side of a walk's end: a flare against a door's wall, the rounding into the
 * turning circle (`sweep`, where the end meets it), or into the straight edge of the way it meets,
 * on each side where that way goes on past the walk.
 */
function endFillets(end: WalkEnd, ground: ReadonlySet<string>, sweep: Sweep | null): Vec[][] {
  const { dir } = end;
  const out: Vec[][] = [];
  for (const side of [-1, 1]) {
    const from = { x: -dir.y * side, y: dir.x * side };
    if (end.door) {
      out.push(squareFillet({ x: end.at.x + from.x * WALK.half, y: end.at.y + from.y * WALK.half }, dir, from, FILLET.door));
    } else if (sweep) {
      const edge = { x: end.at.x - dir.x * 2 + from.x * WALK.half, y: end.at.y - dir.y * 2 + from.y * WALK.half };
      const fillet = circleFillet(edge, dir, from, sweep.centre, sweep.outer, FILLET.way);
      if (fillet) out.push(fillet);
    } else if (ground.has(key({ x: end.beyond.x + from.x, y: end.beyond.y + from.y }))) {
      const face = { x: end.at.x - dir.x * 0.5, y: end.at.y - dir.y * 0.5 };
      out.push(squareFillet({ x: face.x + from.x * WALK.half, y: face.y + from.y * WALK.half }, dir, from, FILLET.way));
    }
  }
  return out;
}

/** The drive's straight runs on into its turning circle, from the porch and from the gate, with the fillets where their edges meet it. */
function driveIntoTurn(sweep: Sweep, ground: ReadonlySet<string>): Vec[][] {
  const half = sweep.reach - 2;
  const out: Vec[][] = [];
  for (const dy of [-1, 1]) {
    const outside = { x: sweep.centre.x - 0.5, y: sweep.centre.y + dy * (sweep.reach + 0.5) };
    if (!ground.has(key({ x: Math.floor(outside.x), y: Math.floor(outside.y) }))) continue;
    const edge = sweep.centre.y + dy * sweep.reach;
    out.push(rectPoly({ x: sweep.centre.x - half, y: Math.min(edge, sweep.centre.y), w: half * 2, h: sweep.reach }));
    for (const side of [-1, 1]) {
      const edge = { x: sweep.centre.x + side * half, y: outside.y };
      const fillet = circleFillet(edge, { x: 0, y: -dy }, { x: side, y: 0 }, sweep.centre, sweep.outer, FILLET.way);
      if (fillet) out.push(fillet);
    }
  }
  return out;
}

const SIDES: readonly Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** A line's points without those in a straight run: its ends and its turns. */
function corners(points: readonly Vec[]): Vec[] {
  const out: Vec[] = [points[0]!];
  for (let i = 1; i + 1 < points.length; i++) {
    const a = out[out.length - 1]!;
    const p = points[i]!;
    const b = points[i + 1]!;
    if (Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-9) out.push(p);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/**
 * The line through `turns` with each turn rounded: a quarter circle reaching `TURN_REACH` along each
 * leg, less where a leg is short (half a leg between two turns, all but half a cell of an end leg).
 */
function rounded(turns: readonly Vec[]): Vec[] {
  const out: Vec[] = [turns[0]!];
  for (let i = 1; i + 1 < turns.length; i++) {
    const a = turns[i - 1]!;
    const p = turns[i]!;
    const b = turns[i + 1]!;
    const la = Math.hypot(p.x - a.x, p.y - a.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    const reach = Math.max(0, Math.min(TURN_REACH, i === 1 ? la - 0.5 : la / 2, i + 2 === turns.length ? lb - 0.5 : lb / 2));
    const ua = { x: (a.x - p.x) / la, y: (a.y - p.y) / la };
    const ub = { x: (b.x - p.x) / lb, y: (b.y - p.y) / lb };
    const from = { x: p.x + ua.x * reach, y: p.y + ua.y * reach };
    const to = { x: p.x + ub.x * reach, y: p.y + ub.y * reach };
    // A quadratic from leg to leg with the turn as its control point: tangent to both legs.
    const steps = Math.max(2, Math.ceil((reach * Math.PI) / 2 / CURVE_STEP));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push({ x: u * u * from.x + 2 * u * t * p.x + t * t * to.x, y: u * u * from.y + 2 * u * t * p.y + t * t * to.y });
    }
  }
  out.push(turns[turns.length - 1]!);
  return out;
}

/** The ground of a walk along `turns`: its rounded line grown to either side by its wavering half width, as one ring. */
function ribbonOf(turns: readonly Vec[], seed: number): Vec[] {
  const line = rounded(turns);
  // Long straight legs are stepped too, so the edge can waver along them.
  const points: Vec[] = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CURVE_STEP * 6)));
    for (let k = 1; k <= n; k++) points.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  const left: Vec[] = [];
  const right: Vec[] = [];
  let along = 0;
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(points.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const normal = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    if (i > 0) along += Math.hypot(p.x - a.x, p.y - a.y);
    // The ends keep their width, where they meet a door or a way.
    const ends = Math.min(1, along / 0.5, (length - along) / 0.5);
    const side = (salt: number): number => WALK.half + WALK.waver * ends * (valueNoise(along / WALK.stretch, salt, seed) * 2 - 1);
    left.push({ x: p.x + normal.x * side(0.5), y: p.y + normal.y * side(0.5) });
    right.push({ x: p.x - normal.x * side(7.5), y: p.y - normal.y * side(7.5) });
  });
  return [...left, ...right.reverse()];
}
