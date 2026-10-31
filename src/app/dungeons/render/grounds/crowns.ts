/**
 * A tree's crown seen from above, as an illustrator builds it: never one round blob, but masses of
 * leaves of different sizes, the low ones round the rim, higher ones over them towards the middle,
 * with here and there a gap down to the limbs. A broadleaf crown is clumps with a scalloped, leafy
 * edge; a conifer's is whorls of needled branches, one over the other, narrowing to its leader.
 * Worked out once per tree from its cell, so a tree keeps its shape in every look.
 */

import { hash2 } from '../art/noise';
import { TO_LIGHT } from '../art/light';
import type { Vec } from '../geometry';
import { polyPath } from '../art/paths';

export type CrownSpecies = 'broadleaf' | 'conifer';

/** An outline to fill: points, and where `controls` is given, a curve from each point to the next, bowed through its control point. */
export interface MassShape {
  points: Vec[];
  controls?: Vec[];
}

/** One mass of leaves (or a conifer's whorl): its outline, middle and size, and how high it stands in the crown, 0 its rim to 1 its top. */
export interface Clump {
  /** The outline as points: each scallop's root and crest, or a conifer's branch tips and notches. */
  ring: Vec[];
  /** The outline to fill: a broadleaf mass's curved scallops, a conifer whorl's points. */
  shape: MassShape;
  centre: Vec;
  radius: number;
  height: number;
  /** The part of the mass the light still reaches: the mass drawn in towards the light, leaving its core shadow round the far side. */
  lit: MassShape;
  /** Single leaves caught by the light round the lit part, three points each (none on a conifer, whose needles catch it). */
  leaves: Vec[];
  /** The low body the rim's masses bulge out of: part of the silhouette, its own face all but hidden. */
  body?: true;
}

/** A gap in the leaves, down to a limb: its outline, and the limb across it from the trunk. */
export interface CrownGap {
  ring: Vec[];
  limb: [Vec, Vec];
}

/** A tree's crown: its masses from the lowest up, its gaps, and the radius it reaches round its trunk. */
export interface Crown {
  species: CrownSpecies;
  clumps: Clump[];
  gaps: CrownGap[];
  /** Every clump's outline, whose union is the crown's silhouette (for its shadow on the ground). */
  rings: Vec[][];
  centre: Vec;
  radius: number;
  /** -1..1: this tree's own shade of green, so a stand of trees is not one colour. */
  tint: number;
}

/** A share of conifers among the trees. */
const CONIFERS = 0.3;

export function crownOf(centre: Vec, radius: number): Crown {
  const cell = { x: Math.floor(centre.x), y: Math.floor(centre.y) };
  const h = (k: number): number => hash2(cell.x, cell.y, 40 + k);
  const species: CrownSpecies = h(0) < CONIFERS ? 'conifer' : 'broadleaf';
  const { clumps, gaps } = species === 'conifer' ? conifer(centre, radius, h) : broadleaf(centre, radius, h);
  return { species, clumps, gaps, rings: clumps.map((c) => c.ring), centre, radius, tint: h(1) * 2 - 1 };
}

/** A point at `angle` and `distance` from `c`. */
const polar = (c: Vec, angle: number, distance: number): Vec => ({ x: c.x + Math.cos(angle) * distance, y: c.y + Math.sin(angle) * distance });

/**
 * Masses of leaves round the trunk: a ring of low ones round the rim, of sizes that differ and at
 * spacings that differ, a few between them and the middle, and one or two on top, a little towards
 * the light, where the crown rises highest. Between the rim and the top, where no mass lies, gaps.
 */
function broadleaf(centre: Vec, radius: number, h: (k: number) => number): { clumps: Clump[]; gaps: CrownGap[] } {
  const clumps: Clump[] = [];
  const add = (at: Vec, r: number, height: number, salt: number): void => {
    clumps.push(leafyMass(at, r, height, salt));
  };
  // The low body of the crown, which the rim's masses bulge out of, so none stands off on its own.
  const at = polar(centre, h(7) * Math.PI * 2, radius * 0.06);
  clumps.push({ ...leafyMass(at, radius * 0.7, 0, 45), leaves: [], body: true });
  const rim = 6 + Math.floor(h(2) * 3);
  const phase = h(3) * Math.PI * 2;
  // Uneven spacings, summing to a full turn.
  const steps = Array.from({ length: rim }, (_, k) => 0.6 + h(10 + k));
  const total = steps.reduce((a, b) => a + b, 0);
  let angle = phase;
  const rimAngles: number[] = [];
  // How far out a gap may lie on each rim mass's ray and still be inside the leaves.
  const rimReach: number[] = [];
  for (let k = 0; k < rim; k++) {
    const size = radius * (0.25 + 0.16 * h(20 + k));
    const out = radius - size * (1.02 + 0.12 * h(30 + k));
    add(polar(centre, angle, out), size, 0.02 + 0.1 * h(40 + k), 50 + k);
    rimAngles.push(angle);
    rimReach.push(out - size * 0.35);
    angle += (steps[k]! / total) * Math.PI * 2;
  }
  // Between the rim and the top: two to four masses midway, each over the joint of two rim masses; gaps on other rim masses.
  const middle = 2 + Math.floor(h(4) * 3);
  // Spread round the crown, never all to one side.
  const middles = new Set(Array.from({ length: middle }, (_, j) => Math.floor((j * rim) / middle + h(8) * rim) % rim));
  const gaps: CrownGap[] = [];
  for (let k = 0; k < rim; k++) {
    const a = rimAngles[k]! + ((steps[k]! / total) * Math.PI * 2) / 2;
    if (middles.has(k)) {
      const size = radius * (0.26 + 0.12 * h(60 + k));
      add(polar(centre, a, radius * (0.42 + 0.12 * h(70 + k))), size, 0.35 + 0.2 * h(80 + k), 90 + k);
    } else if (gaps.length < (radius > 1 ? 2 : 1) && h(100 + k) < 0.7) {
      // On a rim mass's inner side, where the masses above leave it open.
      const size = radius * (0.07 + 0.03 * h(120 + k));
      gaps.push(gapAt(centre, rimAngles[k]!, Math.min(rimReach[k]!, radius * 0.55) - size, size, 130 + k));
    }
  }
  // The top: one or two masses over the trunk, nudged towards the light.
  const tops = h(5) < 0.5 ? 1 : 2;
  for (let k = 0; k < tops; k++) {
    const a = Math.atan2(TO_LIGHT.y, TO_LIGHT.x) + (h(140 + k) - 0.5) * 2.6 + k * Math.PI;
    add(polar(centre, a, radius * (0.08 + 0.14 * h(150 + k))), radius * (tops === 1 ? 0.42 : 0.33) * (0.9 + 0.2 * h(160 + k)), 0.85 + 0.15 * k, 170 + k);
  }
  clumps.sort((a, b) => a.height - b.height);
  return { clumps, gaps };
}

/**
 * A mass of leaves: its outline a scalloped edge, each scallop a little bulge of leaves, of
 * irregular widths and depths, round a body that is itself a little out of round. A mass on the
 * rim, whose edge is the crown's against the lawn, has finer scallops than one inside the crown.
 */
export function leafyMass(at: Vec, r: number, height: number, salt: number, lobes?: number): Clump {
  const count = lobes ?? Math.max(9, Math.round(r * (height < 0.2 ? 24 : 18)));
  const lean = hash2(salt, 3, 7) * Math.PI * 2;
  const roots: Vec[] = [];
  let angle = hash2(salt, 1, 7) * Math.PI * 2;
  const step = (Math.PI * 2) / count;
  for (let k = 0; k < count; k++) {
    // A body a little longer one way than the other, and each scallop's root a little in or out.
    const body = r * (1 + 0.08 * Math.cos(2 * (angle - lean)) + 0.05 * Math.cos(3 * angle + lean) - 0.1 * hash2(salt, k, 8));
    roots.push(polar(at, angle, body));
    angle += step * (0.7 + 0.6 * hash2(salt, k, 9));
  }
  const shape = { points: roots, controls: bows(roots, at, false) };
  return { ring: crested(roots, shape.controls), shape, centre: at, radius: r, height, lit: litPart(shape, at, r), leaves: litLeaves(at, r, salt) };
}

/** A conifer from above: four whorls of needled branches, each narrower and higher, round its leader. */
function conifer(centre: Vec, radius: number, h: (k: number) => number): { clumps: Clump[]; gaps: CrownGap[] } {
  const whorls = [1, 0.8, 0.58, 0.36];
  const turn = h(6) * Math.PI * 2;
  const clumps = whorls.map((k, tier): Clump => {
    // Each whorl a little towards the light, as the tree's top leans out of its own shade.
    const at = polar(centre, Math.atan2(TO_LIGHT.y, TO_LIGHT.x), radius * (1 - k) * 0.12);
    const r = radius * k * (0.94 + 0.06 * h(200 + tier));
    const ring = needledRing(at, r, 8 + Math.round(k * 14), turn + tier * 0.4, 210 + tier);
    return { ring, shape: { points: ring }, centre: at, radius: r, height: tier / (whorls.length - 1), lit: litPart({ points: ring }, at, r), leaves: [] };
  });
  return { clumps, gaps: [] };
}

/** A whorl's outline: branch tips, every one a point, of lengths that differ, with the needles' notches between. */
export function needledRing(at: Vec, r: number, branches: number, turn: number, salt: number): Vec[] {
  const out: Vec[] = [];
  for (let k = 0; k < branches; k++) {
    const a = turn + ((k + 0.25 * (hash2(salt, k, 1) - 0.5)) / branches) * Math.PI * 2;
    const half = Math.PI / branches;
    const tip = r * (0.84 + 0.16 * hash2(salt, k, 2));
    // A branch's tip leans a little with the whorl's turn, its needles fanning to blunt shoulders.
    out.push(polar(at, a - half * 0.6, tip * 0.86), polar(at, a + half * 0.12, tip), polar(at, a + half * 0.55, tip * 0.88), polar(at, a + half, r * (0.72 + 0.08 * hash2(salt, k, 3))));
  }
  return out;
}

/** A gap in the leaves at `angle`, `distance` out from the trunk, with a limb running through it outwards. */
function gapAt(centre: Vec, angle: number, distance: number, size: number, salt: number): CrownGap {
  const at = polar(centre, angle, distance);
  const roots = Array.from({ length: 9 }, (_, k) => polar(at, (k / 9) * Math.PI * 2 + angle, size * (0.75 + 0.6 * hash2(salt, k, 4))));
  const ring = crested(roots, bows(roots, at, true));
  return { ring, limb: [polar(centre, angle, distance - size * 2), polar(centre, angle + 0.25 * (hash2(salt, 0, 5) - 0.5), distance + size * 2)] };
}

/**
 * `shape` scaled by 0.82 about the point 0.72 of its radius towards the light. A scalloped mass's
 * lit part is an edge between two tones of leaves, so it is traced more coarsely: a curve through
 * every second root, the root between pulling it out (a scaled curve is the curve of its scaled points).
 */
export function litPart(shape: MassShape, centre: Vec, radius: number): MassShape {
  const ox = centre.x + TO_LIGHT.x * radius * 0.72;
  const oy = centre.y + TO_LIGHT.y * radius * 0.72;
  const scaled = (p: Vec, out = 1): Vec => ({ x: ox + (centre.x + (p.x - centre.x) * out - ox) * 0.82, y: oy + (centre.y + (p.y - centre.y) * out - oy) * 0.82 });
  if (!shape.controls) return { points: shape.points.map((p) => scaled(p)) };
  const pairs = Math.floor(shape.points.length / 2);
  const at = (k: number): Vec => shape.points[k % (pairs * 2)]!;
  return { points: Array.from({ length: pairs }, (_, k) => scaled(at(k * 2))), controls: Array.from({ length: pairs }, (_, k) => scaled(at(k * 2 + 1), 1.08)) };
}

/** Leaves of different sizes, thick towards the lit edge of a mass and thinning away from it, a few loose: each three points, long one way. */
function litLeaves(centre: Vec, radius: number, salt: number): Vec[] {
  const count = Math.round(radius * 18);
  const toLight = Math.atan2(TO_LIGHT.y, TO_LIGHT.x);
  const out: Vec[] = [];
  for (let k = 0; k < count; k++) {
    const t = hash2(salt, k, 2);
    const a = toLight + (hash2(salt, k, 1) - 0.5) * (1.2 + 1.6 * t);
    const d = radius * (0.82 - 0.6 * t * t);
    const x = centre.x + Math.cos(a) * d;
    const y = centre.y + Math.sin(a) * d;
    const r = radius * (0.06 + 0.08 * hash2(salt, k, 3)) * (1.2 - 0.5 * t);
    const turn = hash2(salt, k, 4) * Math.PI * 2;
    const ux = Math.cos(turn) * r;
    const uy = Math.sin(turn) * r;
    out.push({ x: x + ux, y: y + uy }, { x: x - ux - uy * 0.6, y: y - uy + ux * 0.6 }, { x: x - ux * 0.6 + uy * 0.6, y: y - uy * 0.6 - ux * 0.6 });
  }
  return out;
}

/**
 * The control point of every edge of `ring`, bowing it outwards (or into it, for a gap the leaves
 * close round): a scalloped edge of leaves out of a ring of points, each scallop of its own depth.
 */
function bows(ring: readonly Vec[], centre: Vec, inward: boolean): Vec[] {
  const n = ring.length;
  return ring.map((q, k) => {
    const p = ring[(k + 1) % n]!;
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const len = Math.hypot(p.x - q.x, p.y - q.y);
    const dx = mx - centre.x;
    const dy = my - centre.y;
    const d = (Math.hypot(dx, dy) || 1) * (inward ? -1 : 1);
    // Leaves of different sizes: some scallops full, some barely bowed.
    const bulge = 0.25 + 0.4 * hash2(k, n, 11);
    return { x: mx + (dx / d) * len * bulge, y: my + (dy / d) * len * bulge };
  });
}

/** Every root followed by its scallop's crest, halfway from the edge's middle to its control point: the outline as points. */
function crested(roots: readonly Vec[], controls: readonly Vec[]): Vec[] {
  return roots.flatMap((q, k) => {
    const p = roots[(k + 1) % roots.length]!;
    const c = controls[k]!;
    return [q, { x: (q.x + p.x) / 4 + c.x / 2, y: (q.y + p.y) / 4 + c.y / 2 }];
  });
}

/** Traces an outline: its curves where it has them (a canvas pays for a curve about as for two or three points), else its points. */
export function traceShape(path: CanvasPath, { points, controls }: MassShape): void {
  if (!controls) {
    polyPath(points)(path);
    return;
  }
  path.moveTo(points[0]!.x, points[0]!.y);
  for (let k = 0; k < points.length; k++) {
    const p = points[(k + 1) % points.length]!;
    path.quadraticCurveTo(controls[k]!.x, controls[k]!.y, p.x, p.y);
  }
  path.closePath();
}
