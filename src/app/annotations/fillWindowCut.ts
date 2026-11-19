/**
 * A cut into a fill, worked out where the eraser is alone. A fill carved for a while has thousands
 * of points, and clipping all of them for every move of the pointer costs milliseconds; a move
 * changes the fill only in the small box around itself (the window). So each ring is walked once
 * in plain numbers: what of it lies in the window is clipped, and what lies beyond is kept as it
 * is and joined on again where the ring crossed the window's edge.
 *
 * Inside the window a ring stands in for itself as a closed curve: each stretch of it that runs
 * outside is replaced by a way along the window's edge that goes round the window the same way,
 * which leaves every point of the window wound around as before.
 *
 * For clean fills only (`cleanFills.ts`), whose rings bound the fill wherever they run. Whatever
 * does not fit (rings that meet on the window's edge, a ring wound round the window more than
 * once) gives null, and the caller cuts the whole fill.
 */

import { normalizePolygon, subtractShapes } from '../lighting/polygonClip';
import { Q_SCALE, type QPolygon, type QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { segmentDistanceSq, windingNumber } from './lineMath';
import type { FilledPart } from './quantized';
import { pointKey, WindowRing, type CutWindow, type Stretch } from './windowRing';

/** How far a point where a ring crossed the window's edge may lie from the line through its neighbours and still be left out, world pixels: it was put on the clipping grid. */
const JOINT_TOLERANCE = 0.2;
/** How far beyond the sweep the window reaches, on the clipping grid: tried in turn, since a ring's corner on the window's very edge fits no rule. */
const MARGINS: readonly number[] = [8, 11, 14, 19];

/** A way of the clipped fill's edge through the window, from one point on the window's edge to another. */
interface Path {
  readonly coordinates: number[];
  readonly end: number;
  used: boolean;
}

function windowAround(sweep: QShape, margin: number): CutWindow | null {
  let [X0, Y0, X1, Y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of sweep) {
    for (let i = 0; i < ring.length; i += 2) {
      X0 = Math.min(X0, ring[i]!);
      X1 = Math.max(X1, ring[i]!);
      Y0 = Math.min(Y0, ring[i + 1]!);
      Y1 = Math.max(Y1, ring[i + 1]!);
    }
  }
  if (!(X0 <= X1)) return null;
  [X0, Y0, X1, Y1] = [X0 - margin, Y0 - margin, X1 + margin, Y1 + margin];
  const CX = Math.floor((X0 + X1) / 2);
  const CY = Math.floor((Y0 + Y1) / 2);
  return { X0, Y0, X1, Y1, CX, CY, x0: X0 / Q_SCALE, y0: Y0 / Q_SCALE, x1: X1 / Q_SCALE, y1: Y1 / Q_SCALE, cx: CX / Q_SCALE, cy: CY / Q_SCALE };
}

/** Twice the area `ring` winds around, signed as the clipping library's rings are: above 0 for an outline, below for a hole. */
function signedArea(ring: readonly Point[]): number {
  const first = ring[0]!;
  let twice = 0;
  for (let i = 1; i < ring.length - 1; i++) {
    twice += (ring[i]!.x - first.x) * (ring[i + 1]!.y - first.y) - (ring[i + 1]!.x - first.x) * (ring[i]!.y - first.y);
  }
  return twice;
}

/** Whether the edge between two corners of a clipped ring runs along the window's edge: it stands for the fill beyond, and is no edge of the fill. */
function alongWindow(ring: QPolygon, i: number, j: number, { X0, Y0, X1, Y1 }: CutWindow): boolean {
  const [ax, ay, bx, by] = [ring[i * 2]!, ring[i * 2 + 1]!, ring[j * 2]!, ring[j * 2 + 1]!];
  return (ax === bx && (ax === X0 || ax === X1)) || (ay === by && (ay === Y0 || ay === Y1));
}

/** The ways through the window that `ring` (a ring of the clipped fill) is made of, into `paths` by where they begin; `'whole'` for a ring that never runs along the window's edge, `'none'` for one that only does. Null where two ways begin at one point. */
function pathsOf(ring: QPolygon, win: CutWindow, paths: Map<number, Path>): 'whole' | 'none' | 'split' | null {
  const count = ring.length / 2;
  let first = -1;
  for (let i = 0; i < count && first < 0; i++) {
    const next = (i + 1) % count;
    if (alongWindow(ring, i, next, win) && !alongWindow(ring, next, (next + 1) % count, win)) first = next;
  }
  if (first < 0) return alongWindow(ring, 0, 1 % count, win) ? 'none' : 'whole';
  let at = first;
  do {
    const coordinates = [ring[at * 2]!, ring[at * 2 + 1]!];
    const start = pointKey(coordinates[0]!, coordinates[1]!);
    while (!alongWindow(ring, at, (at + 1) % count, win)) {
      at = (at + 1) % count;
      coordinates.push(ring[at * 2]!, ring[at * 2 + 1]!);
    }
    if (paths.has(start)) return null;
    paths.set(start, { coordinates, end: pointKey(ring[at * 2]!, ring[at * 2 + 1]!), used: false });
    while (alongWindow(ring, at, (at + 1) % count, win)) at = (at + 1) % count;
  } while (at !== first);
  return 'split';
}

const worldRing = (ring: QPolygon): Point[] => {
  const points: Point[] = [];
  for (let i = 0; i < ring.length; i += 2) points.push({ x: ring[i]! / Q_SCALE, y: ring[i + 1]! / Q_SCALE });
  return points;
};

/**
 * The rings of the fill after the cut: the clipped rings that lie in the window whole, and the
 * ways through the window joined with the stretches beyond it, each where the other ends. Null
 * where they do not fit together.
 */
function joinedRings(clipped: QShape, stretches: readonly Stretch[], win: CutWindow): Point[][] | null {
  const ends = new Map<number, { stretch: Stretch; forward: boolean }>();
  for (const stretch of stretches) {
    if (stretch.from === stretch.to || ends.has(stretch.from) || ends.has(stretch.to)) return null;
    ends.set(stretch.from, { stretch, forward: true });
    ends.set(stretch.to, { stretch, forward: false });
  }
  const rings: Point[][] = [];
  const paths = new Map<number, Path>();
  for (const ring of clipped) {
    const made = pathsOf(ring, win, paths);
    if (made === null) return null;
    if (made === 'whole') rings.push(worldRing(ring));
  }
  const walked = new Set<Stretch>();
  for (const path of paths.values()) {
    if (path.used) continue;
    const ring: Point[] = [];
    /** The places in `ring` of the points on the window's edge. */
    const joints: number[] = [];
    let current = path;
    for (;;) {
      current.used = true;
      joints.push(ring.length);
      for (let i = 0; i < current.coordinates.length; i += 2) ring.push({ x: current.coordinates[i]! / Q_SCALE, y: current.coordinates[i + 1]! / Q_SCALE });
      joints.push(ring.length - 1);
      const end = ends.get(current.end);
      if (!end || walked.has(end.stretch)) return null;
      walked.add(end.stretch);
      const beyond = end.stretch.points;
      if (end.forward) for (const point of beyond) ring.push(point);
      else for (let i = beyond.length - 1; i >= 0; i--) ring.push(beyond[i]!);
      const next = paths.get(end.forward ? end.stretch.to : end.stretch.from);
      if (!next) return null;
      if (next === path) break;
      if (next.used) return null;
      current = next;
    }
    rings.push(withoutJoints(ring, joints));
  }
  return walked.size === stretches.length ? rings : null;
}

/**
 * `ring` without the points where it crossed the window's edge, wherever such a point lies on the
 * line through its neighbours: it stood on an edge of the fill that the cut did not turn, and left
 * in, every move of the eraser would leave two more points on every edge near it.
 */
function withoutJoints(ring: readonly Point[], joints: readonly number[]): Point[] {
  const joint = new Set(joints);
  const kept: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const point = ring[i]!;
    if (joint.has(i)) {
      const before = kept[kept.length - 1] ?? ring[ring.length - 1]!;
      const after = ring[(i + 1) % ring.length]!;
      if (segmentDistanceSq(point.x, point.y, before.x, before.y, after.x, after.y) <= JOINT_TOLERANCE * JOINT_TOLERANCE) continue;
    }
    kept.push(point);
  }
  return kept;
}

function cutIn(win: CutWindow, outline: readonly Point[], holes: readonly (readonly Point[])[], sweep: QShape): FilledPart[] | null {
  const walk = new WindowRing(win);
  const outer = walk.of(outline, outline.length - 1);
  // A window the outline does not wind around holds none of the fill: nothing this way of cutting can say.
  if (!outer || (outer.kind === 'beyond' && !outer.around)) return null;
  const stretches: Stretch[] = outer.kind === 'crossing' ? [...outer.stretches] : [];
  const clip: QPolygon[] = [...sweep];
  const beyond: (readonly Point[])[] = [];
  for (const hole of holes) {
    const walked = walk.of(hole, hole.length);
    if (!walked) return null;
    if (walked.kind === 'beyond') {
      if (walked.around) return null;
      beyond.push(hole);
      continue;
    }
    clip.push(...normalizePolygon(walked.curve));
    if (walked.kind === 'crossing') stretches.push(...walked.stretches);
  }
  const { X0, Y0, X1, Y1 } = win;
  const subject = outer.kind === 'beyond' ? [X0, Y0, X1, Y0, X1, Y1, X0, Y1] : outer.curve;
  const rings = joinedRings(subtractShapes([subject], clip), stretches, win);
  if (!rings || rings.some((ring) => ring.length < 3)) return null;

  const outers: Point[][] = outer.kind === 'beyond' ? [outline.slice(0, -1)] : [];
  const cut: Point[][] = beyond.map((hole) => [...hole]);
  for (const ring of rings) (signedArea(ring) > 0 ? outers : cut).push(ring);
  if (outers.length === 0) return [];
  // The largest outline is asked last and takes what no other holds: its points are the many.
  outers.sort((a, b) => b.length - a.length);
  const parts: FilledPart[] = outers.map((ring) => ({ outline: ring, holes: [] }));
  for (const hole of cut) {
    const inside = hole[0]!;
    const holder = parts.slice(1).find((part) => windingNumber(inside, part.outline) !== 0) ?? parts[0]!;
    holder.holes.push(hole);
  }
  return parts;
}

/**
 * The clean fill of `outline` (closed: its last point is its first) less `holes`, less `sweep`
 * (a shape of the clipping grid), as the areas left of it, cut in a window around the sweep
 * alone. Every ring the sweep is not near keeps its points as they are. Null where the fill does
 * not fit this way of cutting; the whole of it is clipped then.
 */
export function windowCut(outline: readonly Point[], holes: readonly (readonly Point[])[], sweep: QShape): FilledPart[] | null {
  if (outline.length < 4) return null;
  for (const margin of MARGINS) {
    const win = windowAround(sweep, margin);
    if (!win) return null;
    const parts = cutIn(win, outline, holes, sweep);
    if (parts) return parts;
  }
  return null;
}
