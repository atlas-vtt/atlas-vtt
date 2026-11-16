import type { CellPoint, DungeonLake, DungeonRiver, DungeonRiverBridge } from '../model';
import { subtractRings, unionRings } from '../render/clipShapes';
import { pointsBounds, signedArea2, type Bounds } from '../render/geometry';
import { lineField, type LineField } from './lineField';

/**
 * A Forest's rivers and lakes as shapes, in cells, shared by their drawing and their scene. A
 * river's banks lie half its width either side of its middle line; its water reaches them except
 * on the inside of a bend, where a bar of sand and gravel lies (`riverBars`), widest at the bend's
 * apex, as point bars build where the current slows; the outer bank, where it runs fast, is cut
 * steep and the water reaches it. Bends are never tighter than the banks allow (`riverCourse`), so
 * the banks are plain offset lines and never fold.
 */

type Vec = CellPoint;

/** The widest a bar is, as a share of the river's width. */
const BAR_SHARE = 0.34;
/** No bar lies in a river narrower than this, in cells: a brook's bends hold none worth drawing. */
const BAR_LEAST_WIDTH = 0.9;
/** How many points either side a bend's curvature is averaged over, so a bar grows and wanes smoothly. */
const BEND_REACH = 8;

/** The unit normal at point `i` of a line, to its left as it runs (the side its heading turns to as it grows). */
export function normalAt(points: readonly Vec[], i: number): Vec {
  const p = points[Math.max(0, i - 1)]!;
  const q = points[Math.min(points.length - 1, i + 1)]!;
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
}

interface Banks {
  /** The banks, half the width out. */
  left: Vec[];
  right: Vec[];
  /** The water's edges: the banks, or the edge of a bar on a bend's inside. */
  leftWater: Vec[];
  rightWater: Vec[];
}

const banksOf = new WeakMap<DungeonRiver, Banks>();

/** A river's banks and the edges of its water. */
function banks(river: DungeonRiver): Banks {
  const kept = banksOf.get(river);
  if (kept) return kept;
  const { points, widths } = river;
  const turn = bends(points);
  const found: Banks = { left: [], right: [], leftWater: [], rightWater: [] };
  points.forEach((p, i) => {
    const n = normalAt(points, i);
    const half = widths[i]! / 2;
    // How sharp the bend is for a river this wide: 0 straight, 1 near the tightest a river turns.
    const bend = Math.max(0, Math.min(1, (Math.abs(turn[i]!) * widths[i]! - 0.08) / 0.3));
    const bar = widths[i]! < BAR_LEAST_WIDTH ? 0 : BAR_SHARE * widths[i]! * bend * bend * (3 - 2 * bend);
    // A bend turning left has its inside, and its bar, on the left.
    const [inLeft, inRight] = turn[i]! > 0 ? [bar, 0] : [0, bar];
    found.left.push({ x: p.x + n.x * half, y: p.y + n.y * half });
    found.right.push({ x: p.x - n.x * half, y: p.y - n.y * half });
    found.leftWater.push({ x: p.x + n.x * (half - inLeft), y: p.y + n.y * (half - inLeft) });
    found.rightWater.push({ x: p.x - n.x * (half - inRight), y: p.y - n.y * (half - inRight) });
  });
  banksOf.set(river, found);
  return found;
}

/** How sharply a line bends at each point, per cell (positive turning towards its left normal), averaged over a short reach. */
export function bends(points: readonly Vec[]): number[] {
  return smoothed(turning(points), BEND_REACH);
}

/** The heading's turn at each point per cell (positive towards the left normal). */
function turning(points: readonly Vec[]): number[] {
  return points.map((_, i) => {
    if (i === 0 || i === points.length - 1) return 0;
    const a = points[i - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const h = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    const len = (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y)) / 2 || 1;
    return Math.atan2(Math.sin(h), Math.cos(h)) / len;
  });
}

function smoothed(values: readonly number[], reach: number): number[] {
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, i - reach); k <= Math.min(values.length - 1, i + reach); k++) { sum += values[k]!; count += 1; }
    return sum / count;
  });
}

/** Outlines wound as clipping winds an outline, so a union never cancels one against another. */
function wound(ring: Vec[]): Vec[] {
  return signedArea2(ring) < 0 ? ring.reverse() : ring;
}

/** The river's water from point `from` to point `to`, an outline along its water's edges. */
function waterBetween(river: DungeonRiver, from: number, to: number): Vec[] {
  const { leftWater, rightWater } = banks(river);
  return wound([...leftWater.slice(from, to + 1), ...rightWater.slice(from, to + 1).reverse()]);
}

/** The river's water, bank to bar, as one outline. */
export function riverWater(river: DungeonRiver): Vec[] {
  return waterBetween(river, 0, river.points.length - 1);
}

/** The bars on the inside of the river's bends: sand and gravel between the water's edge and the bank. */
export function riverBars(river: DungeonRiver): Vec[][] {
  const { left, right, leftWater, rightWater } = banks(river);
  const bars: Vec[][] = [];
  for (const [bank, edge] of [[left, leftWater], [right, rightWater]] as const) {
    let start = -1;
    for (let i = 0; i <= bank.length; i++) {
      const open = i < bank.length && Math.hypot(bank[i]!.x - edge[i]!.x, bank[i]!.y - edge[i]!.y) > 0.03;
      if (open && start < 0) start = i;
      if (!open && start >= 0) {
        if (i - start >= 4) bars.push(wound([...bank.slice(start, i), ...edge.slice(start, i).reverse()]));
        start = -1;
      }
    }
  }
  return bars;
}

const watersOf = new WeakMap<readonly DungeonRiver[], Vec[][]>();

/** All the floor's river and lake water as one, as clipping gives it (outlines and islands). */
export function floorWater(rivers: readonly DungeonRiver[] | undefined, lakes: readonly DungeonLake[] | undefined): Vec[][] {
  if (!rivers?.length) return [];
  const kept = watersOf.get(rivers);
  if (kept) return kept;
  const whole = unionRings([...rivers.map(riverWater), ...(lakes ?? []).map((lake) => wound([...lake.outline]))]);
  const islands = riverIslands(rivers);
  const water = islands.length ? subtractRings(whole, islands) : whole;
  watersOf.set(rivers, water);
  return water;
}

/** The islands the rivers part round, wound as outlines. */
export function riverIslands(rivers: readonly DungeonRiver[]): Vec[][] {
  return rivers.flatMap((river) => (river.islands ?? []).map((island) => wound([...island])));
}

/** A point on a bridge: `u` cells along it from its first end, `v` across it. */
export function bridgePoint(bridge: DungeonRiverBridge, u: number, v: number): Vec {
  const { at, along, length } = bridge;
  return { x: at.x + along.x * (u - length / 2) - along.y * v, y: at.y + along.y * (u - length / 2) + along.x * v };
}

/** The four corners of a bridge's deck. */
export function deckOf(bridge: DungeonRiverBridge): Vec[] {
  const { length } = bridge;
  const half = bridge.breadth / 2;
  return [bridgePoint(bridge, 0, -half), bridgePoint(bridge, length, -half), bridgePoint(bridge, length, half), bridgePoint(bridge, 0, half)];
}

/** How many of a river's points one stretch of it holds: about four cells, short enough that a bend's water flows round it. */
const STRETCH = 16;

/** A stretch of moving water and the way it flows there, or a lake, which does not. */
export interface WaterStretch {
  /** As clipping gives them: outlines and holes (islands). */
  rings: Vec[][];
  flow?: Vec;
  /** The river's middle the water flows along, downstream; only where the piece is a whole river. */
  course?: Vec[];
}

const stretchesOf = new WeakMap<readonly DungeonRiver[], WaterStretch[]>();
const coursesOf = new WeakMap<readonly DungeonRiver[], WaterStretch[]>();

/**
 * The floor's water in pieces that each move one way: every lake whole and still, then each river
 * in stretches of about four cells along its water's edges, each with the way the river runs there.
 * A river gives way to the lakes and the rivers before it (a tributary to the river it joins), so no
 * water is in two pieces; stretches meet edge to edge.
 */
export function waterStretches(rivers: readonly DungeonRiver[] | undefined, lakes: readonly DungeonLake[] | undefined): WaterStretch[] {
  if (!rivers?.length) return [];
  const kept = stretchesOf.get(rivers);
  if (kept) return kept;
  const pieces = waterPieces(rivers, lakes, STRETCH);
  stretchesOf.set(rivers, pieces);
  return pieces;
}

/**
 * The floor's water as `waterStretches` gives it, but each river whole, flowing along its course:
 * the water a moving surface follows round every bend, so it is cut nowhere but where it meets a
 * lake or the river it joins.
 */
export function waterCourses(rivers: readonly DungeonRiver[] | undefined, lakes: readonly DungeonLake[] | undefined): WaterStretch[] {
  if (!rivers?.length) return [];
  const kept = coursesOf.get(rivers);
  if (kept) return kept;
  const pieces = waterPieces(rivers, lakes, Infinity);
  coursesOf.set(rivers, pieces);
  return pieces;
}

/** Lakes whole, then each river in pieces of `stretch` of its points, giving way to the water before it. */
function waterPieces(rivers: readonly DungeonRiver[], lakes: readonly DungeonLake[] | undefined, stretch: number): WaterStretch[] {
  const pieces: WaterStretch[] = [];
  // The islands first: no water lies on them.
  const earlier: { rings: Vec[][]; bounds: Bounds }[] = riverIslands(rivers).map((island) => ({ rings: [island], bounds: pointsBounds(island) }));
  const islands = earlier.flatMap((island) => island.rings);
  for (const lake of lakes ?? []) {
    const shore = [wound([...lake.outline])];
    const rings = islands.length ? subtractRings(shore, islands) : shore;
    pieces.push({ rings });
    earlier.push({ rings, bounds: pointsBounds(lake.outline) });
  }
  for (const river of rivers) {
    const own: typeof earlier = [];
    const last = river.points.length - 1;
    const whole = stretch >= last;
    for (let a = 0; a < last; a += stretch) {
      const b = Math.min(last, a + stretch);
      const band = waterBetween(river, a, b);
      const bounds = pointsBounds(band);
      const before = earlier.filter((piece) => overlaps(piece.bounds, bounds)).flatMap((piece) => piece.rings);
      const rings = before.length ? subtractRings([band], before) : [band];
      if (!rings.length) continue;
      const dx = river.points[b]!.x - river.points[a]!.x;
      const dy = river.points[b]!.y - river.points[a]!.y;
      const len = Math.hypot(dx, dy) || 1;
      pieces.push({ rings, flow: { x: dx / len, y: dy / len }, ...(whole && { course: river.points }) });
      own.push({ rings, bounds });
    }
    earlier.push(...own);
  }
  return pieces;
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/** How far a point lies from the water, bank to bank and lake shore, in cells: negative in it. */
export type WaterField = LineField;

const NONE: WaterField = { distance: () => Infinity };
const fields = new WeakMap<readonly DungeonRiver[], WaterField>();

/**
 * The rivers' and lakes' field, kept for the list: the drawing asks it a few million times. Inside
 * a lake it is negative; on an island in a river, a little way out of the water.
 */
export function waterField(rivers: readonly DungeonRiver[] | undefined, lakes?: readonly DungeonLake[]): WaterField {
  if (!rivers?.length) return NONE;
  const kept = fields.get(rivers);
  if (kept) return kept;
  // Each segment: its ends and how far its water reaches from it, five numbers.
  const segments: number[] = [];
  for (const river of rivers) {
    for (let i = 0; i + 1 < river.points.length; i++) {
      const a = river.points[i]!;
      const b = river.points[i + 1]!;
      segments.push(a.x, a.y, b.x, b.y, (river.widths[i]! + river.widths[i + 1]!) / 4);
    }
  }
  for (const { outline } of lakes ?? []) {
    outline.forEach((a, i) => {
      const b = outline[(i + 1) % outline.length]!;
      segments.push(a.x, a.y, b.x, b.y, 0);
    });
  }
  const field = lineField(segments, (lakes ?? []).map((lake) => lake.outline), riverIslands(rivers));
  fields.set(rivers, field);
  return field;
}
