import type { Canvas2D, Vec } from '../geometry';
import { centroid } from '../art/paths';
import { hash2 } from '../art/noise';
import { mixColours } from '../palette';
import type { StoneColours } from './colours';

/**
 * Rock as a painter blocks it in: flat facets, each one tone of a few steps set by how it faces
 * the one light at the top left, never a gradient or a noise. Facets are gathered per tone and
 * filled once each, so a band of thousands of chips costs a handful of fills.
 */

/** A point of a facet with its height above the floor, in cells. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The light, as the textures have it: from the top left, a little above the map. */
const LIGHT = (() => {
  const l = [-0.5, -0.5, 0.71];
  const n = Math.hypot(...l);
  return { x: l[0]! / n, y: l[1]! / n, z: l[2]! / n };
})();

/** Tone steps below and above the rock's own colour. */
const SHADE_STEPS = 3;
const LIT_STEPS = 2;
/**
 * How much one step of shade or light moves the colour. A dark look's rock lies near its paper, so
 * its shade steps stay small (deeper, a facet would take the paper's colour and read as a hole)
 * and the light carries the modelling.
 */
const SHADE_STEP = { light: 0.13, dark: 0.04 };
const LIT_STEP = { light: 0.13, dark: 0.12 };

/** The tones of a rock, darkest first; index `SHADE_STEPS` is the rock's own colour. */
export function rockTones(c: StoneColours, rock = c.rock): string[] {
  const deep = c.dark ? '#000000' : c.line;
  const lit = c.mono ? c.floor : c.light;
  const shade = c.dark ? SHADE_STEP.dark : SHADE_STEP.light;
  const light = c.dark ? LIT_STEP.dark : LIT_STEP.light;
  const tones: string[] = [];
  for (let k = SHADE_STEPS; k > 0; k--) tones.push(mixColours(rock, deep, k * shade));
  tones.push(rock);
  for (let k = 1; k <= LIT_STEPS; k++) tones.push(mixColours(rock, lit, k * light));
  return tones;
}

/** How much a face of normal (`nx`, `ny`, `nz`) is lit beyond a level one; it faces up whichever way it was turned. */
function lightOfNormal(nx: number, ny: number, nz: number): number {
  const up = nz < 0 ? -1 : 1;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return (up * (nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z)) / length - LIGHT.z;
}

/** How much a facet is lit beyond a flat floor's light, from its corners (Newell's normal); 0 is level. */
export function facetLight(corners: readonly Vec3[]): number {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return lightOfNormal(nx, ny, nz);
}

/** The tone of `tones` (`rockTones`) `step` steps from the rock's own colour, below it shaded. */
export function rockTone(tones: readonly string[], step: number): string {
  return tones[SHADE_STEPS + step]!;
}

/** The tone step of a facet lit `light` beyond level, `steps` steps to a unit of light; 0 is the rock's own colour. */
export function toneStep(light: number, steps: number): number {
  return Math.max(-SHADE_STEPS, Math.min(LIT_STEPS, Math.round(light * steps)));
}

/**
 * Facets gathered by tone and filled once per tone. Over a surface already filled in the rock's own
 * colour (`overRock`), the facets of that tone are left out: they would paint what is there.
 */
export class FacetBatch {
  private readonly polys: Vec[][][];

  constructor(private readonly tones: readonly string[], private readonly overRock = false) {
    this.polys = tones.map(() => []);
  }

  /** Adds a facet lit `light` beyond level (`facetLight`), `steps` tones to a unit of light. */
  add(poly: readonly Vec[], light: number, steps = 5): void {
    const k = toneStep(light, steps);
    if (this.overRock && k === 0) return;
    this.polys[SHADE_STEPS + k]!.push(poly as Vec[]);
  }

  fill(ctx: Canvas2D): void {
    for (let t = 0; t < this.tones.length; t++) {
      const polys = this.polys[t]!;
      if (!polys.length) continue;
      ctx.beginPath();
      for (const poly of polys) {
        ctx.moveTo(poly[0]!.x, poly[0]!.y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i]!.x, poly[i]!.y);
        ctx.closePath();
      }
      ctx.fillStyle = this.tones[t]!;
      ctx.fill();
    }
  }
}

/**
 * A boulder or slab seen from above as its planes, as an inked boulder is split: a flat top round
 * `apex`, `top` of the way in from the outline and tipped a little by `tip` (its slopes along x and
 * y), and a bevelled face down from each edge of the top to the outline, `height` below it.
 */
export function boulderFacets(poly: readonly Vec[], apex: Vec, height: number, top: number, tip: Vec): { face: Vec[]; light: number }[] {
  // Worked out on plain numbers: a pile's stones are thousands of faces, each drawn once.
  const n = poly.length;
  const ridge: Vec[] = new Array<Vec>(n);
  const lift = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const r = { x: apex.x + (p.x - apex.x) * top, y: apex.y + (p.y - apex.y) * top };
    ridge[i] = r;
    lift[i] = height + (r.x - apex.x) * tip.x + (r.y - apex.y) * tip.y;
  }
  let tx = 0;
  let ty = 0;
  let tz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = ridge[i]!;
    const b = ridge[j]!;
    tx += (a.y - b.y) * (lift[i]! + lift[j]!);
    ty += (lift[i]! - lift[j]!) * (a.x + b.x);
    tz += (a.x - b.x) * (a.y + b.y);
  }
  const out: { face: Vec[]; light: number }[] = [{ face: ridge, light: lightOfNormal(tx, ty, tz) }];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = poly[i]!;
    const b = poly[j]!;
    const c = ridge[j]!;
    const d = ridge[i]!;
    const zc = lift[j]!;
    const zd = lift[i]!;
    // Newell's normal of a, b (on the floor), c, d (on the top).
    const nx = (b.y - c.y) * zc + (c.y - d.y) * (zc + zd) + (d.y - a.y) * zd;
    const ny = (b.x + c.x) * -zc + (c.x + d.x) * (zc - zd) + (d.x + a.x) * zd;
    const nz = (a.x - b.x) * (a.y + b.y) + (b.x - c.x) * (b.y + c.y) + (c.x - d.x) * (c.y + d.y) + (d.x - a.x) * (d.y + a.y);
    out.push({ face: [a, b, c, d], light: lightOfNormal(nx, ny, nz) });
  }
  return out;
}

/**
 * A boulder's bevels side by side that come out in one tone (`tone` of their light), joined into
 * one face: fewer, larger faces to fill, and no seam between faces of one tone. The top is the
 * first face and stays alone; bevels that all share a tone stay apart (they would be a ring).
 */
function joinedBevels(faces: { face: Vec[]; light: number }[], tone: (light: number) => number): { face: Vec[]; light: number }[] {
  const n = faces.length - 1;
  const step = new Int8Array(n);
  for (let i = 0; i < n; i++) step[i] = tone(faces[i + 1]!.light);
  let start = -1;
  for (let i = 0; i < n && start < 0; i++) if (step[i] !== step[(i + n - 1) % n]) start = i;
  if (start < 0) return faces;
  const out = [faces[0]!];
  for (let i = 0; i < n;) {
    const first = (start + i) % n;
    let count = 1;
    while (i + count < n && step[(start + i + count) % n] === step[first]) count++;
    // Each bevel is [outline i, outline i+1, ridge i+1, ridge i]: the run's outline forwards, then its ridge back.
    const face: Vec[] = [];
    for (let k = 0; k < count; k++) face.push(faces[1 + ((first + k) % n)]!.face[0]!);
    const last = faces[1 + ((first + count - 1) % n)]!.face;
    face.push(last[1]!, last[2]!);
    for (let k = count - 1; k >= 0; k--) face.push(faces[1 + ((first + k) % n)]!.face[3]!);
    out.push({ face, light: faces[1 + first]!.light });
    i += count;
  }
  return out;
}

/**
 * A loose stone or slab of rock as its planes, keyed to where it lies: its flat top set off its
 * middle and tipped a little, its bevels down to the outline, as `boulderFacets` makes them, those
 * side by side that the caller draws in one tone (`tone` of their light) joined into one face.
 */
export function stoneFacets(poly: readonly Vec[], seed: number, tone: (light: number) => number): { face: Vec[]; light: number }[] {
  const middle = centroid(poly);
  let radius = 0;
  for (const p of poly) radius = Math.max(radius, Math.hypot(p.x - middle.x, p.y - middle.y));
  const key = [Math.round(middle.x * 61), Math.round(middle.y * 61)] as const;
  const angle = hash2(key[0], key[1], seed + 41) * Math.PI * 2;
  const off = radius * (0.12 + hash2(key[0], key[1], seed + 42) * 0.28);
  const apex = { x: middle.x + Math.cos(angle) * off, y: middle.y + Math.sin(angle) * off };
  const tip = { x: (hash2(key[0], key[1], seed + 44) - 0.5) * 0.5, y: (hash2(key[0], key[1], seed + 45) - 0.5) * 0.5 };
  const top = 0.42 + hash2(key[0], key[1], seed + 46) * 0.22;
  return joinedBevels(boulderFacets(poly, apex, radius * (0.25 + hash2(key[0], key[1], seed + 43) * 0.2), top, tip), tone);
}
