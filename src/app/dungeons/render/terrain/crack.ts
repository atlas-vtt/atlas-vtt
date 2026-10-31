import type { DungeonTerrain } from '../../model';
import { resample } from '../../water/smooth';
import type { Hand } from '../art/hand';
import { TO_LIGHT } from '../art/light';
import { valueNoise } from '../art/noise';
import { grown, polysPath } from '../art/paths';
import { pointsBounds, type Vec } from '../geometry';
import type { RenderEnv } from '../renderEnv';
import { cellRings } from './cellRings';
import { brokenLedges, dropDepth, dropTone } from './drops';
import { cellSet } from './pieces';
import { raggedRing, type RaggedShape } from './scatterPatch';
import { chiselled } from './stones';

/**
 * A bottomless chasm or shaft on a cave's floor: a crack in the rock, not a hole cut along cell
 * lines. Its outline is the cells' traced and rounded as a cave's rubble patch is, then broken
 * into short chipped facets as split rock is, and held near its cells, since the scene's walls
 * stand on the cells and must never stand over drawn void. Into it the rock's face darkens by the
 * drop's own gradient, in the look's warm shadow before black, deepest in the middle; short
 * ledges break along its rim and a few ticks in the walls' ink run down the face under the lip
 * that lies in shadow.
 */

/** Softer than a rubble patch, its swell shorter, pulled a little in: a crack's lip follows its cells but never a cell line for long. */
const CRACK: RaggedShape = { sigma: 1.8, waves: 1.7, swell: 0.18, rag: 0.1, outwards: -0.04 };
/** How soft a small ring's corners may be at most, per cell round it; its swell and rag shrink alike, so a one-cell shaft stays nearly as wide as its cell. */
const SIGMA_PER_CELL = 0.3;
/** How long the facets of a crack's lip are before they are chipped, in cells: split rock breaks in short flat faces. */
const FACET = 0.3;
/** How far a chip wanders either side of its facet, in cells. */
const CHIP = 0.04;
/** How far past its cells a crack's lip may lie, in cells; the ink drawn on it reaches a little farther. */
const REACH = 0.25;
/** How much of the drop's darkness goes to black over the face's warm shadow: the rest keeps the look's warmth. */
const DEEP = 0.65;
/** Ledges: how far in from the lip, and how short their pieces (a noise of this many per cell, broken above `LEDGE_GAP`). */
const LEDGE_INSETS = [0.07, 0.16];
const LEDGE_SCALE = 6.5;
const LEDGE_GAP = 0.5;
/** Ticks down the face in shadow: their spacing along the lip, how much of it they take, and their length, in cells. */
const TICK_SPACING = 0.1;
const TICK_GAP = 0.45;
const TICK_LENGTH = 0.09;
const TICK_GROWTH = 0.12;
/** How far a face must look away from the light to take ticks: only the lip nearest the light. */
const TICK_SHADE = -0.35;

/** The point moved back to `REACH` cells from the nearest of the cells, where it lies farther out. */
function heldToCells(p: Vec, cells: ReadonlySet<string>): Vec {
  const cx = Math.floor(p.x);
  const cy = Math.floor(p.y);
  if (cells.has(`${cx},${cy}`)) return p;
  let nearest: Vec | null = null;
  let distance = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!cells.has(`${cx + dx},${cy + dy}`)) continue;
      const q = { x: Math.min(Math.max(p.x, cx + dx), cx + dx + 1), y: Math.min(Math.max(p.y, cy + dy), cy + dy + 1) };
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < distance) [nearest, distance] = [q, d];
    }
  }
  if (!nearest || distance <= REACH) return p;
  return { x: nearest.x + ((p.x - nearest.x) * REACH) / distance, y: nearest.y + ((p.y - nearest.y) * REACH) / distance };
}

/** How far round a ring of cell edges, in cells. */
function perimeter(ring: readonly Vec[]): number {
  return ring.reduce((sum, p, i) => sum + Math.hypot(ring[(i + 1) % ring.length]!.x - p.x, ring[(i + 1) % ring.length]!.y - p.y), 0);
}

/** The crack's outline: every ring of its cells walked, rounded and roughened, broken into chipped facets, then held near its cells. */
export function crackRings(env: RenderEnv, piece: DungeonTerrain): Vec[][] {
  const seed = env.dungeon.model.seed + piece.id * 17 + 811;
  const cells = cellSet(piece.cells);
  return cellRings(piece.cells).map((ring) => {
    const k = Math.min(1, (perimeter(ring) * SIGMA_PER_CELL) / CRACK.sigma);
    const shape = { ...CRACK, sigma: CRACK.sigma * k, swell: CRACK.swell * k, rag: CRACK.rag * k, outwards: CRACK.outwards * k };
    return chiselled(resample(raggedRing(ring, seed, shape), FACET, 5), seed + 2, CHIP).map((p) => heldToCells(p, cells));
  });
}

/** Short strokes from the lip down the face that looks away from the light, a few at a time. */
function ticks(rings: readonly Vec[][]): Vec[][] {
  const out: Vec[][] = [];
  for (const ring of rings) {
    const walked = resample(ring, TICK_SPACING);
    const n = walked.length;
    walked.forEach((p, i) => {
      const before = walked[(i - 1 + n) % n]!;
      const after = walked[(i + 1) % n]!;
      const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
      // The crack lies on the right of the way round.
      const inward = { x: -(after.y - before.y) / length, y: (after.x - before.x) / length };
      if (inward.x * TO_LIGHT.x + inward.y * TO_LIGHT.y > TICK_SHADE) return;
      const noise = valueNoise(p.x * 2.4, p.y * 2.4, 29);
      if (noise < TICK_GAP) return;
      const reach = TICK_LENGTH + TICK_GROWTH * valueNoise(p.x * 9, p.y * 9, 31);
      // Down the face, leaning a little with the fall of the light.
      const way = { x: inward.x - TO_LIGHT.x * 0.25, y: inward.y - TO_LIGHT.y * 0.25 };
      const w = Math.hypot(way.x, way.y) || 1;
      const from = { x: p.x + inward.x * 0.02, y: p.y + inward.y * 0.02 };
      out.push([from, { x: from.x + (way.x / w) * reach, y: from.y + (way.y / w) * reach }]);
    });
  }
  return out;
}

/** A crack drawn whole: rock face (`face` cells wide) in warm shadow, its dark middle, ledges, ticks and lip. */
export function drawCrack(hand: Hand, rings: Vec[][], face: number): void {
  const path = polysPath(rings);
  const bounds = grown(pointsBounds(rings.flat()), 0.1);
  const { depth, inward } = dropDepth(hand, rings);
  hand.surface(path, 'rock');
  const tone = dropTone(depth, inward, 'void', face);
  hand.tone(tone, bounds, path, 'shade');
  hand.tone((x, y) => DEEP * tone(x, y), bounds, path, 'depth');
  hand.line(brokenLedges(rings, LEDGE_INSETS, LEDGE_SCALE, LEDGE_GAP), 'fine');
  hand.line(ticks(rings), 'outline');
  for (const ring of rings) hand.edges(ring, false);
}
