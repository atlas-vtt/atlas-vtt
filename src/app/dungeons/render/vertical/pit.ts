import { rngFrom } from '../../rng';
import type { Hand } from '../art/hand';
import { SHADOW_DIR } from '../art/light';
import { valueNoise } from '../art/noise';
import { centroid, grown, polysPath, smoothstep, type Field } from '../art/paths';
import { drawField, fieldOf, gridOver } from '../art/raster';
import { pointsBounds, type Vec } from '../geometry';
import { withAlpha } from '../palette';
import { dropDepth, brokenLedges } from '../terrain/drops';
import { insetRuns } from '../shore';
import { wallInkWidth } from '../wallInk';
import { band, inkOf, litLip, lookOf, shadeArea, ticks } from './marks';
import { broken, normalsOf, offsetRun } from './runs';
import { drawRubble, insideOf, rubbleStone } from './rubble';

/**
 * A pit or shaft seen from above, as surveys and Dyson Logos draw one: an irregular rim as heavy as
 * a wall on its far side and thinner towards the light, a broken lip ring just inside it, ticks
 * pointing in. Inside, the near wall (under the rim towards the light) lies in the rim's shadow, a
 * crescent as wide as the drop is deep, and a sliver of the far wall catches the light. A drop onto
 * a floor shows that floor lighter below, with what fell down it; a bottomless one darkens in
 * steps towards its middle, never to flat black. A hole cut out of the map over the floor below
 * keeps the floor below showing: only its face, crescent, lip and rim are drawn over it.
 */

export type PitBottom = 'void' | 'floor' | 'cut';

export interface PitOptions {
  /** How deep it drops, in feet; bottomless where it opens on nothing. */
  feet: number;
  bottom: PitBottom;
  seed: number;
  /** The face a cut hole keeps before it opens onto the level below, in cells. */
  face?: number;
  /** Where a rope goes over the lip: no tick there. */
  keepClear?: Vec;
  /** Drawn between the depth and the lip (a rope over the edge). */
  rigged?: () => void;
}

/** How far apart the steps a bottomless pit darkens by lie, in cells. */
const STEP = 0.12;
/** The face just under the lip, before the first step down. */
const FACE_ZONE = 0.11;
/** The bare lip: no tone this close to the rim, so the ticks and the rim read. */
const LIP = 0.025;

/** How dark the pit is at a point, 0..1, by how far in it lies and which wall it is under. */
function pitTone(depth: Field, inward: (x: number, y: number) => Vec, feet: number, bottom: PitBottom, face: number): Field {
  const b = band(feet);
  return (x, y) => {
    const d = depth(x, y);
    if (d <= LIP) return 0;
    const n = inward(x, y);
    // Under the rim towards the light (the near wall) the inward way runs with the shadow's fall.
    const s = n.x * SHADOW_DIR.x + n.y * SHADOW_DIR.y;
    const grain = 0.04 * (valueNoise(x * 6, y * 6, 3) - 0.5);
    const crescent = s > 0.1 && d < b * (0.6 + 0.4 * s) ? 0.5 + 0.22 * s : 0;
    // The far wall's lit sliver, then the face under the lip, darker under the near rim.
    const wall = s < -0.3 ? 0.06 : 0.16 + 0.2 * Math.max(0, s);
    if (d < Math.min(FACE_ZONE, face)) return Math.max(crescent, wall + grain);
    if (bottom === 'cut') return d < face ? Math.max(crescent, wall + grain) : 0;
    if (bottom === 'floor') return d < face ? Math.max(crescent, wall + 0.16 + grain) : Math.max(crescent * 0.9, 0.26 + grain);
    // Bottomless: darker in steps towards the middle, a little paper always left.
    // Each step's edge is softened over a fifth of it, so the raster never shows its texels as stairs.
    const k = (d - FACE_ZONE) / STEP;
    const step = Math.min(0.78, 0.4 + 0.13 * (Math.floor(k) + smoothstep(0.8, 1, k - Math.floor(k))));
    return Math.max(crescent, step + grain);
  };
}

/** The rim: wall-weight on the far side of the light, thinning to seven tenths towards it, laid inward from the rim's line so it never reaches past it. */
export function pitRim(hand: Hand, ring: readonly Vec[]): void {
  const low = insideOf(ring);
  const normals = normalsOf(ring, true);
  const w = wallInkWidth(hand.scene.env.style) * (lookOf(hand) === 'engraving' ? 0.8 : 1);
  const inner = offsetRun(ring, normals, i => {
    const out = { x: -normals[i]!.x * low, y: -normals[i]!.y * low };
    return w * (0.85 + 0.15 * (out.x * SHADOW_DIR.x + out.y * SHADOW_DIR.y));
  }, low);
  const { ctx } = hand.scene.env;
  ctx.save();
  ctx.beginPath();
  polysPath([ring, inner.reverse()])(ctx);
  ctx.fillStyle = lookOf(hand) === 'crayon' ? withAlpha(inkOf(hand), 0.88) : inkOf(hand);
  ctx.fill();
  ctx.restore();
}

/** What came down onto the floor below: a few stones in the lit middle, none on the walls. */
function fallen(hand: Hand, rings: readonly Vec[][], depth: Field, seed: number): void {
  const rng = rngFrom(seed);
  const stones = [];
  for (const ring of rings) {
    const c = centroid(ring);
    for (let i = 0; i < 4; i++) {
      const p = { x: c.x + (rng() - 0.5) * 0.4, y: c.y + (rng() - 0.5) * 0.4 };
      const r = 0.025 + 0.035 * rng();
      if (depth(p.x, p.y) > 0.2 + r) stones.push(rubbleStone(rng, p, r));
    }
  }
  drawRubble(hand, stones);
}

/** The crumbling lip just inside a rim: a broken hairline 0.085 cells in, a fifth to a third of it gone. */
export function lipRing(ring: readonly Vec[], seed: number): Vec[][] {
  const low = insideOf(ring);
  return broken(offsetRun(ring, normalsOf(ring, true), () => 0.085, low), seed + 21, 0.72, 6.5, true);
}

export function drawPit(hand: Hand, rings: Vec[][], options: PitOptions): void {
  const { feet, bottom, seed } = options;
  const path = polysPath(rings);
  const bounds = grown(pointsBounds(rings.flat()), 0.1);
  const { depth, inward } = dropDepth(hand, rings);
  const face = options.face ?? 0.22;
  const b = band(feet);
  // Plain rock: a texture's facets would read as tiles under the tone.
  hand.fill(path, 'rock');
  // The floor below, seen past the face.
  if (bottom === 'floor') hand.fill(polysPath(rings.flatMap(r => insetRuns(r, face).filter(run => run.length > 2))), 'floor');
  shadeArea(hand, pitTone(depth, inward, feet, bottom, face), bounds, path, bottom === 'void' ? 'depth' : 'shade');
  if (bottom === 'cut') {
    // Open onto the level below past the face.
    const { ctx } = hand.scene.env;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    if (hand.scene.raster) {
      const grid = gridOver(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, hand.scene.grid.res);
      drawField(ctx, grid, [0, 0, 0], fieldOf(grid, (x, y) => smoothstep(face, face + 0.05, depth(x, y))));
    } else {
      ctx.beginPath();
      path(ctx);
      ctx.fill();
    }
    ctx.restore();
    // The near wall's shadow reaches past the face onto what shows below, never as far as the middle.
    const reach = Math.min(b, face + 0.08);
    shadeArea(hand, (x, y) => {
      const d = depth(x, y);
      const n = inward(x, y);
      const s = n.x * SHADOW_DIR.x + n.y * SHADOW_DIR.y;
      return d > face * 0.6 && d < reach * (0.6 + 0.4 * Math.max(0, s)) && s > 0 ? 0.45 * s : 0;
    }, bounds, path, 'depth');
  } else if (bottom === 'floor') fallen(hand, rings, depth, seed);
  if (bottom === 'void' && lookOf(hand) !== 'ink') {
    // The rock falling away in steps, each loop further in more broken; tone shows them in ink.
    [0.75, 0.6, 0.45].forEach((keep, k) => hand.line(brokenLedges(rings, [FACE_ZONE + STEP * k], 4 + k, keep), 'fine'));
  }
  options.rigged?.();
  // The crumbling lip just inside the rim.
  hand.line(rings.flatMap(ring => lipRing(ring, seed)), 'fine');
  for (const ring of rings) {
    const low = insideOf(ring);
    ticks(hand, ring, low, Math.min(0.11, 0.05 + b * 0.12), { closed: true, seed: seed + 11, ...(options.keepClear && { keepClear: options.keepClear }) });
    pitRim(hand, ring);
    litLip(hand, ring, low, true, 0.012);
  }
}
